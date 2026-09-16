import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { generateContentCalendar } from "@/lib/social/contentGenerator";
import { getTodaysTopics } from "@/lib/social/topicSeeds";
import { evaluateApproval } from "@/lib/social/riskEvaluator";
import { raiseAutonomyFlag } from "@/lib/social/autonomyFlags";
import { PLATFORMS_REQUIRING_MEDIA } from "@/lib/social/publishPost";
import { pickPostingSlots } from "@/lib/social/postingSlots";
import { connectedPlatforms, tiktokContentOverride } from "@/lib/social/connectedPlatforms";
import type { SocialBrand, SocialPlatform } from "@/lib/database.types";

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

  const results: { brandId: string; brandName: string; generated: number; auto: number; review: number; rejected: number }[] = [];

  for (const brand of brands ?? []) {
    const platforms = await connectedPlatforms(service, brand);
    if (platforms.length === 0) continue;

    let posts;
    try {
      const topics = await getTodaysTopics(service, brand);
      const platformOverrides = await tiktokContentOverride(service, brand, platforms);
      posts = await generateContentCalendar({
        brandName: brand.name,
        voiceNotes: brand.voice_notes,
        platforms,
        postCount: brand.posting_frequency_per_day,
        topics,
        platformOverrides,
      });
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
      const needsMedia = status === "auto" && PLATFORMS_REQUIRING_MEDIA.includes(post.platform);
      const finalStatus = needsMedia ? "draft" : status === "auto" ? "scheduled" : "draft";

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
          scheduled_at: finalStatus === "scheduled" ? slots[i] : null,
        })
        .select("id")
        .maybeSingle();

      if (finalStatus === "scheduled") {
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
