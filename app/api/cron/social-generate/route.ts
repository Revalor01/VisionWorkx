import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { generateContentCalendar } from "@/lib/social/contentGenerator";
import { getTodaysTopics } from "@/lib/social/topicSeeds";
import { evaluateApproval } from "@/lib/social/riskEvaluator";
import { raiseAutonomyFlag } from "@/lib/social/autonomyFlags";
import { pickPostingSlots } from "@/lib/social/postingSlots";
import { connectedPlatforms } from "@/lib/social/connectedPlatforms";
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
      posts = await generateContentCalendar({
        brandName: brand.name,
        voiceNotes: brand.voice_notes,
        platforms,
        postCount: brand.posting_frequency_per_day,
        topics,
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
          status: status === "auto" ? "scheduled" : "draft",
          scheduled_at: status === "auto" ? slots[i] : null,
        })
        .select("id")
        .maybeSingle();

      if (status === "auto") {
        autoCount++;
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
