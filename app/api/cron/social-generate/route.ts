import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { generateContentCalendar } from "@/lib/social/contentGenerator";
import { getTodaysTopics } from "@/lib/social/topicSeeds";
import { evaluateApproval } from "@/lib/social/riskEvaluator";
import { raiseAutonomyFlag } from "@/lib/social/autonomyFlags";
import { PLATFORMS_REQUIRING_MEDIA } from "@/lib/social/publishPost";
import { pickPostingSlots } from "@/lib/social/postingSlots";
import { connectedPlatforms, tiktokContentOverride } from "@/lib/social/connectedPlatforms";
import { brandMediaPolicy, weeklyPlatforms } from "@/lib/social/brandMediaPolicy";
import type { SocialBrand, SocialPlatform } from "@/lib/database.types";
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

    // A brand on a weekly cadence (e.g. Revalor Kids: 1 image post per platform per week) only
    // posts on the platforms that still have room in the last 7 days, one post each, image only.
    const policy = brandMediaPolicy(brand.name);
    const weekly = policy.weeklyAutopilot;
    let genPlatforms = platforms;
    if (weekly) {
      const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
      const { data: recent } = await service.from("social_content").select("platform").eq("brand_id", brand.id).eq("generated_by", "autonomous").gte("created_at", since);
      const counts: Record<string, number> = {};
      for (const r of recent ?? []) counts[r.platform as string] = (counts[r.platform as string] ?? 0) + 1;
      genPlatforms = weeklyPlatforms(policy, platforms, counts);
      if (!genPlatforms.length) {
        results.push({ brandId: brand.id, brandName: brand.name, generated: 0, auto: 0, review: 0, rejected: 0, skipped: `${brand.name} already posted this week (${weekly.postsPerWeek}/platform/week).` });
        continue;
      }
    }

    let posts;
    try {
      const topics = await getTodaysTopics(service, brand);
      const platformOverrides = await tiktokContentOverride(service, brand, genPlatforms);
      const generate = (forPlatforms: typeof platforms, postCount: number) => generateContentCalendar({
        brandName: brand.name,
        voiceNotes: brand.voice_notes,
        platforms: forPlatforms,
        postCount,
        topics,
        platformOverrides,
        avoidProducts: coverage.names,
        excludeProducts: cover.exclude,
      });
      posts = weekly
        ? (await Promise.all(genPlatforms.map((p) => generate([p], 1)))).flat().filter((post) => genPlatforms.includes(post.platform))
        : await generate(platforms, brand.posting_frequency_per_day);
    } catch (err) {
      console.error(`[cron/social-generate] generation failed for ${brand.name}:`, err);
      continue;
    }

    const slots = pickPostingSlots(posts.length);
    let autoCount = 0;
    let reviewCount = 0;
    let rejectCount = 0;

    for (let i = 0; i < posts.length; i++) {
      const post = posts[i];
      const { status, reason } = evaluateApproval({
        copy: post.caption,
        riskLevel: post.riskLevel,
        bannedWords: brand.banned_words,
        autonomyMode: brand.autonomy_mode as "manual" | "semi_autonomous" | "fully_autonomous",
        audience: brandMediaPolicy(brand.name).audience,
      });

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
          scheduled_at: finalStatus === "scheduled" || weeklyImage ? slots[i] : null,
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

    results.push({ brandId: brand.id, brandName: brand.name, generated: posts.length, auto: autoCount, review: reviewCount, rejected: rejectCount });
  }

  return NextResponse.json({ processedBrands: results.length, results });
}
