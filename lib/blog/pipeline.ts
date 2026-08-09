import { createServiceClient } from "@/lib/supabase";
import { PRODUCTS, nextProductInRotation, type BlogProduct } from "./products";
import { researchKeywords } from "./keywords";
import { generateBlogPost } from "./content";
import { scorePost } from "./optimizer";

export interface PipelineResult {
  ok: boolean;
  product?: BlogProduct;
  keyword?: string;
  postId?: string;
  seoScore?: number;
  error?: string;
}

// Shared by the weekly cron (app/api/cron/blog-generate) and the admin
// "Generate Now" button (app/admin/seo) — one code path, two triggers.
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

    const piece = await generateBlogPost(targetKeyword, productConfig);
    const report = scorePost(piece, targetKeyword);

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
        status: "draft",
      })
      .select("id")
      .single();

    if (insertError) throw new Error(insertError.message);

    await service.from("blog_keywords").update({ used: true }).eq("product", product).eq("keyword", targetKeyword);

    await service.from("blog_run_log").insert({
      status: "success",
      summary: `product=${product} keyword="${targetKeyword}" score=${report.score}`,
    });

    return { ok: true, product, keyword: targetKeyword, postId: inserted.id, seoScore: report.score };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await service.from("blog_run_log").insert({ status: "error", summary: message });
    return { ok: false, error: message };
  }
}
