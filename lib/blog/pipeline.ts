import { createServiceClient } from "@/lib/supabase";
import { PRODUCTS, nextProductInRotation, type BlogProduct } from "./products";
import { researchKeywords } from "./keywords";
import { generateBlogPost } from "./content";
import { scorePost } from "./optimizer";
import { containsBannedWords, BASE_BANNED_WORDS, AUTO_PUBLISH_SCORE_THRESHOLD, SEMI_AUTONOMOUS_SCORE_THRESHOLD } from "./safety";
import { raiseBlogAutonomyFlag } from "./autonomyFlags";
import type { Database } from "@/lib/database.types";

type AutonomyMode = Database["public"]["Tables"]["blog_product_config"]["Row"]["autonomy_mode"];

export interface PipelineResult {
  ok: boolean;
  product?: BlogProduct;
  keyword?: string;
  postId?: string;
  seoScore?: number;
  autoPublished?: boolean;
  error?: string;
}

// Used by the weekly cron (app/api/cron/blog-generate) here in vision-workx.
// revalor-admin's "Generate Now" button runs its own copy of this pipeline
// (kept in sync manually) against the same Supabase project — see that
// repo's lib/blog/pipeline.ts.
export async function runBlogGeneration(forceProduct?: BlogProduct): Promise<PipelineResult> {
  const service = createServiceClient();

  try {
    let product: BlogProduct;
    if (forceProduct) {
      product = forceProduct;
    } else {
      const { data: recentPosts } = await service
        .from("blog_posts")
        .select("product, created_at")
        .order("created_at", { ascending: false })
        .limit(50);
      product = nextProductInRotation(recentPosts ?? []);
    }
    const productConfig = PRODUCTS[product];

    const candidates = await researchKeywords(productConfig.seedKeywords);
    if (candidates.length > 0) {
      await service.from("blog_keywords").upsert(
        candidates.map((c) => ({
          product,
          keyword: c.keyword,
          volume: c.volume,
          difficulty: c.difficulty,
          cpc: c.cpc,
          source: c.source,
        })),
        { onConflict: "product,keyword", ignoreDuplicates: true }
      );
    }

    const { data: unused } = await service
      .from("blog_keywords")
      .select("keyword")
      .eq("product", product)
      .eq("used", false)
      .limit(1)
      .maybeSingle();

    const targetKeyword = unused?.keyword ?? productConfig.seedKeywords[0];

    const { data: autonomyConfig } = await service
      .from("blog_product_config")
      .select("autonomy_mode, banned_words, autonomy_paused_at")
      .eq("product", product)
      .maybeSingle();

    // No config row (shouldn't happen post-migration 36) fails safe to manual.
    const autonomyMode: AutonomyMode = autonomyConfig?.autonomy_mode ?? "manual";
    const paused = !!autonomyConfig?.autonomy_paused_at;

    const piece = await generateBlogPost(targetKeyword, productConfig);
    const report = scorePost(piece, targetKeyword);

    const bannedHits = containsBannedWords(
      `${piece.title} ${piece.meta_description} ${piece.excerpt} ${piece.content}`,
      [...BASE_BANNED_WORDS, ...(autonomyConfig?.banned_words ?? [])]
    );

    let autoPublish = false;
    if (!paused && bannedHits.length === 0) {
      if (autonomyMode === "fully_autonomous" && report.score >= AUTO_PUBLISH_SCORE_THRESHOLD) autoPublish = true;
      else if (autonomyMode === "semi_autonomous" && report.score >= SEMI_AUTONOMOUS_SCORE_THRESHOLD) autoPublish = true;
    }

    // Slugs must be globally unique — Claude can plausibly repeat one.
    let slug = piece.slug;
    let suffix = 2;
    while (true) {
      const { data: clash } = await service.from("blog_posts").select("id").eq("slug", slug).maybeSingle();
      if (!clash) break;
      slug = `${piece.slug}-${suffix}`;
      suffix++;
    }

    const { data: inserted, error: insertError } = await service
      .from("blog_posts")
      .insert({
        product,
        keyword: targetKeyword,
        title: piece.title,
        slug,
        meta_description: piece.meta_description,
        excerpt: piece.excerpt,
        body: piece.content,
        faqs: piece.faqs,
        tags: piece.tags,
        seo_score: report.score,
        status: autoPublish ? "published" : "draft",
        published_at: autoPublish ? new Date().toISOString() : null,
        auto_published: autoPublish,
      })
      .select("id")
      .single();

    if (insertError) throw new Error(insertError.message);

    await service.from("blog_keywords").update({ used: true }).eq("product", product).eq("keyword", targetKeyword);

    // Manual mode was never going to auto-publish, so a banned word there is
    // just informational — nothing to pause. Only autonomous modes escalate.
    if (bannedHits.length > 0 && autonomyMode !== "manual") {
      await raiseBlogAutonomyFlag(service, {
        product,
        productName: productConfig.name,
        postId: inserted.id,
        detail: `Contains banned words: ${bannedHits.join(", ")} (post: "${piece.title}")`,
      });
    }

    const scoreBar = autonomyMode === "semi_autonomous" ? SEMI_AUTONOMOUS_SCORE_THRESHOLD : AUTO_PUBLISH_SCORE_THRESHOLD;
    const outcome = autoPublish
      ? `auto-published (${autonomyMode})`
      : paused
        ? "held for review (autonomy paused)"
        : bannedHits.length > 0
          ? `held for review (banned words: ${bannedHits.join(", ")})`
          : autonomyMode === "manual"
            ? "held for review (manual mode)"
            : `held for review (score ${report.score} < ${scoreBar})`;

    await service.from("blog_run_log").insert({
      status: "success",
      summary: `product=${product} keyword="${targetKeyword}" score=${report.score} — ${outcome}`,
    });

    return {
      ok: true,
      product,
      keyword: targetKeyword,
      postId: inserted.id,
      seoScore: report.score,
      autoPublished: autoPublish,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await service.from("blog_run_log").insert({ status: "error", summary: message });
    return { ok: false, error: message };
  }
}
