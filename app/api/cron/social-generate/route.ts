import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { generateContentCalendar, type GeneratedPost } from "@/lib/social/contentGenerator";
import { getTodaysTopics } from "@/lib/social/topicSeeds";
import { evaluateApproval } from "@/lib/social/riskEvaluator";
import { raiseAutonomyFlag } from "@/lib/social/autonomyFlags";
import { PLATFORMS_REQUIRING_MEDIA } from "@/lib/social/publishPost";
import { pickPostingSlots } from "@/lib/social/postingSlots";
import { connectedPlatforms, tiktokContentOverride } from "@/lib/social/connectedPlatforms";
import { brandMediaPolicy, isKidsBrand, weeklyPlatforms } from "@/lib/social/brandMediaPolicy";
import { checkChildSafety } from "@/lib/social/childSafety";
import { productPageUrl, productSlot, weeklyProductPlan } from "@/lib/social/weeklyAutopilot";
import { BRAND_PRODUCTS, PRODUCT_KNOWLEDGE } from "@/lib/social/productKnowledge";
import type { SocialBrand, SocialPlatform, SocialVideoProduct } from "@/lib/database.types";
import { brandCoverage, loadCampaignCoverage } from "@/lib/social/campaignCoverage";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = createServiceClient();

  const { data: brands } = await service
    .from("social_brands")
    .select("*")
    .eq("autonomy_enabled", true)
    .is("autonomy_paused_at", null);

  const results: { brandId: string; brandName: string; generated: number; auto: number; review: number; rejected: number; skipped?: string }[] = [];

  // Renaissance campaigns live right now: Social stands down for their products.
  let coverage: Awaited<ReturnType<typeof loadCampaignCoverage>>;
  try {
    coverage = await loadCampaignCoverage(service);
  } catch (err) {
    // Without knowing what Renaissance covers, posting could double up on a campaign's product — skip this run.
    console.error("[cron/social-generate] campaign coverage lookup failed:", err);
    return NextResponse.json({ skipped: "couldn't read Renaissance campaigns", error: (err as Error).message });
  }

  for (const brand of brands ?? []) {
    const platforms = await connectedPlatforms(service, brand);
    if (platforms.length === 0) continue;

    const cover = brandCoverage(brand.name, coverage.covered);
    if (cover.skip) {
      results.push({ brandId: brand.id, brandName: brand.name, generated: 0, auto: 0, review: 0, rejected: 0, skipped: `A Renaissance campaign is covering all of ${brand.name}'s products.` });
      continue;
    }

    // A brand on a weekly cadence (e.g. Revalor Kids: 1 image post per app per platform per week)
    // only posts where there's room in the last 7 days, image only. Per-app brands tag each post
    // with the app's own page link (…/kids#chorebit), which is how the week's posts are counted.
    const policy = brandMediaPolicy(brand.name);
    const weekly = policy.weeklyAutopilot;
    const now = new Date();
    type Planned = { post: GeneratedPost; slot: string; linkUrl: string | null };
    let planned: Planned[];
    try {
      const topics = await getTodaysTopics(service, brand);
      const generate = async (forPlatforms: typeof platforms, postCount: number, extra: { focusProduct?: string; excludeProducts?: string[] } = {}) =>
        generateContentCalendar({
          brandName: brand.name,
          voiceNotes: brand.voice_notes,
          platforms: forPlatforms,
          postCount,
          topics,
          platformOverrides: await tiktokContentOverride(service, brand, forPlatforms),
          avoidProducts: coverage.names,
          excludeProducts: extra.excludeProducts ?? cover.exclude,
          focusProduct: extra.focusProduct,
        });
      /** At most one post per requested platform, in the requested order. */
      const onePerPlatform = (posts: GeneratedPost[], wanted: string[]) => wanted.map((pl) => posts.find((x) => x.platform === pl)).filter((x): x is GeneratedPost => !!x);

      if (weekly) {
        const since = new Date(now.getTime() - 7 * 86_400_000).toISOString();
        const { data: recent } = await service.from("social_content").select("platform, link_url").eq("brand_id", brand.id).eq("generated_by", "autonomous").gte("created_at", since);
        if (weekly.perProduct) {
          const apps = (BRAND_PRODUCTS[brand.name] ?? []).filter((p) => !cover.exclude.includes(p));
          const plan = weeklyProductPlan(policy, apps, platforms, (recent ?? []) as { platform: string; link_url: string | null }[]);
          planned = [];
          for (const item of plan) {
            const idx = apps.indexOf(item.product as SocialVideoProduct);
            const posts = await generate(item.platforms as typeof platforms, item.platforms.length, {
              focusProduct: PRODUCT_KNOWLEDGE[item.product as SocialVideoProduct]?.name ?? item.product,
              excludeProducts: [...cover.exclude, ...apps.filter((p) => p !== item.product)],
            });
            for (const post of onePerPlatform(posts, item.platforms)) planned.push({ post, slot: productSlot(idx, post.platform, now), linkUrl: productPageUrl(brand.website_url, item.product) });
          }
        } else {
          const counts: Record<string, number> = {};
          for (const r of recent ?? []) counts[r.platform as string] = (counts[r.platform as string] ?? 0) + 1;
          const room = weeklyPlatforms(policy, platforms, counts);
          const posts = onePerPlatform((await Promise.all(room.map((p) => generate([p], 1)))).flat(), room);
          const slots = pickPostingSlots(posts.length);
          planned = posts.map((post, i) => ({ post, slot: slots[i], linkUrl: null }));
        }
        if (!planned.length) {
          results.push({ brandId: brand.id, brandName: brand.name, generated: 0, auto: 0, review: 0, rejected: 0, skipped: `${brand.name} already posted this week (${weekly.postsPerWeek}/${weekly.perProduct ? "app/" : ""}platform/week).` });
          continue;
        }
      } else {
        const posts = await generate(platforms, brand.posting_frequency_per_day);
        const slots = pickPostingSlots(posts.length);
        planned = posts.map((post, i) => ({ post, slot: slots[i], linkUrl: null }));
      }
    } catch (err) {
      console.error(`[cron/social-generate] generation failed for ${brand.name}:`, err);
      continue;
    }

    let autoCount = 0;
    let reviewCount = 0;
    let rejectCount = 0;

    for (const { post, slot, linkUrl } of planned) {
      const verdict = evaluateApproval({
        copy: post.caption,
        riskLevel: post.riskLevel,
        bannedWords: brand.banned_words,
        autonomyMode: brand.autonomy_mode as "manual" | "semi_autonomous" | "fully_autonomous",
        audience: brandMediaPolicy(brand.name).audience,
      });
      let { status } = verdict;
      const { reason } = verdict;

      // Revalor Kids: the child-safety check (ages 12 and under) decides. A draft that passes is
      // approved on its own; one that fails is discarded — never saved, never posted. Not configurable.
      // (Banned words still reject first; publishPost re-checks text + image before anything goes out.)
      if (status !== "reject" && isKidsBrand(brand.name)) {
        const safety = await checkChildSafety({ text: [post.hook, post.caption, post.hashtags.map((h) => `#${h}`).join(" ")].filter(Boolean).join("\n") });
        if (!safety.safe) {
          rejectCount++;
          await raiseAutonomyFlag(service, { brandId: brand.id, brandName: brand.name, kind: "high_risk", detail: `A generated ${post.platform} post was discarded by the Revalor Kids child-safety check (ages 12 and under): ${safety.reason}`, pauseBrand: false });
          continue;
        }
        status = "auto";
      }

      if (status === "reject") {
        rejectCount++;
        await raiseAutonomyFlag(service, {
          brandId: brand.id,
          brandName: brand.name,
          kind: "banned_word",
          detail: `Autonomous post rejected before publishing — ${reason}`,
        });
        break; // pause takes effect immediately — stop generating more for this brand this run
      }

      // Auto-approved but missing a media step this cron can't do itself:
      // publishPost.ts requires an image/video for these platforms and
      // there's no automatic way to generate one here (see
      // PLATFORMS_REQUIRING_MEDIA's comment) — scheduling it anyway would
      // just fail at publish time and pause the whole brand's autonomy,
      // which is exactly what kept happening to Revalor LLC's Instagram
      // posts. Route to draft instead: no pause, no break — the rest of
      // this brand's batch (e.g. a Facebook post, which doesn't need
      // media) still gets evaluated normally.
      // Weekly image brands: an auto-approved post waits as "approved" with an automatic image
      // (the image cron makes it, then schedules the post) — it never goes out without its image.
      const weeklyImage = !!weekly && status === "auto";
      const needsMedia = !weeklyImage && status === "auto" && PLATFORMS_REQUIRING_MEDIA.includes(post.platform);
      const finalStatus = weeklyImage ? "approved" : needsMedia ? "draft" : status === "auto" ? "scheduled" : "draft";

      const { data: inserted } = await service
        .from("social_content")
        .insert({
          brand_id: brand.id,
          platform: post.platform,
          hook: post.hook,
          caption: post.caption,
          hashtags: post.hashtags,
          risk_level: post.riskLevel,
          generated_by: "autonomous",
          status: finalStatus,
          scheduled_at: finalStatus === "scheduled" || weeklyImage ? slot : null,
          link_url: linkUrl,
          auto_image: weeklyImage,
        })
        .select("id")
        .maybeSingle();

      if (finalStatus === "scheduled" || weeklyImage) {
        autoCount++;
      } else if (needsMedia) {
        reviewCount++;
        await raiseAutonomyFlag(service, {
          brandId: brand.id,
          brandName: brand.name,
          contentId: inserted?.id,
          kind: "needs_media",
          detail: `Autonomous ${post.platform} post needs an image or video before it can publish — add one from the dashboard, then publish it manually or let the next slot pick it up.`,
          pauseBrand: false,
        });
        // no break — this isn't a risk/policy problem, just a routine
        // manual step, so the rest of this brand's batch still runs
      } else {
        reviewCount++;
        await raiseAutonomyFlag(service, {
          brandId: brand.id,
          brandName: brand.name,
          contentId: inserted?.id,
          kind: "high_risk",
          detail: reason ?? "Flagged for review",
        });
        break; // pause takes effect immediately — stop generating more for this brand this run
      }
    }

    results.push({ brandId: brand.id, brandName: brand.name, generated: planned.length, auto: autoCount, review: reviewCount, rejected: rejectCount });
  }

  return NextResponse.json({ processedBrands: results.length, results });
}
