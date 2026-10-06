import { createServiceClient } from "@/lib/supabase";
import { generateContentCalendar, type GeneratedPost } from "@/lib/social/contentGenerator";
import { scheduleOverDays } from "@/lib/social/postingSlots";
import { connectedPlatforms } from "@/lib/social/connectedPlatforms";
import { evaluateApproval } from "@/lib/social/riskEvaluator";
import { brandMediaPolicy, maxVideosForHorizon } from "@/lib/social/brandMediaPolicy";
import type { SocialBrand, SocialPlatform } from "@/lib/database.types";

// Generate a 7-15 day content queue for a brand in one pass. Only captions are
// produced here (cheap, batched); media is rendered later by existing async
// jobs: images by the social-images cron (auto_image flag) and hero videos by
// the social-video-worker cron (a queued social_video_assets row). Posts land
// as `scheduled` where they can publish; anything awaiting media or review is a
// draft and flips to scheduled when its media is ready. Per-brand policy is
// respected (Revalor Kids is image-first and capped at ~1 video/week).

const MAX_PER_CALL = 14; // contentGenerator's own cap
export const MAX_BATCH_POSTS = 45; // 15 days x 3/day hard ceiling
export const BATCH_HERO_NOTE = "Batch hero video (queued)";
const VIDEO_PLATFORMS = new Set<SocialPlatform>(["instagram", "tiktok", "youtube"]);

type Service = ReturnType<typeof createServiceClient>;

export interface BatchResult {
  brandId: string;
  brandName: string;
  posts: number;
  scheduled: number;
  draft: number;
  heroVideosQueued: number;
  imagesQueued: number;
  skipped?: string;
}

export interface PostPlan {
  status: "scheduled" | "draft";
  queueHero: boolean;
  autoImage: boolean;
}

/**
 * Pure: where one generated post lands. Not-auto-approved → draft. Otherwise a
 * hero video (video platform, within cap) → draft until the worker renders it;
 * Facebook → scheduled (an image too for image-first brands); Instagram → an
 * auto-image draft the cron will schedule; TikTok/YouTube without a video →
 * draft (they can't publish without one). Exported for tests.
 */
export function planPost(opts: { approval: "auto" | "review" | "reject"; platform: SocialPlatform; canHero: boolean; imageFirst: boolean }): PostPlan {
  if (opts.approval !== "auto") return { status: "draft", queueHero: false, autoImage: false };
  if (opts.canHero && VIDEO_PLATFORMS.has(opts.platform)) return { status: "draft", queueHero: true, autoImage: false };
  if (opts.platform === "facebook") return { status: "scheduled", queueHero: false, autoImage: opts.imageFirst };
  if (opts.platform === "instagram") return { status: "draft", queueHero: false, autoImage: true };
  return { status: "draft", queueHero: false, autoImage: false }; // tiktok/youtube need a video
}

async function generateChunked(brand: SocialBrand, platforms: SocialPlatform[], total: number): Promise<GeneratedPost[]> {
  const posts: GeneratedPost[] = [];
  let remaining = total;
  while (remaining > 0) {
    const chunk = Math.min(remaining, MAX_PER_CALL);
    const gen = await generateContentCalendar({ brandName: brand.name, voiceNotes: brand.voice_notes, platforms, postCount: chunk });
    posts.push(...gen);
    remaining -= chunk;
    if (gen.length < chunk) break;
  }
  return posts;
}

export async function runBatchGenerate(
  service: Service,
  brand: SocialBrand,
  opts: { days: number; perDay: number; videoCount: number },
): Promise<BatchResult> {
  const base: BatchResult = { brandId: brand.id, brandName: brand.name, posts: 0, scheduled: 0, draft: 0, heroVideosQueued: 0, imagesQueued: 0 };

  const platforms = await connectedPlatforms(service, brand);
  if (platforms.length === 0) return { ...base, skipped: "no connected platforms" };

  const policy = brandMediaPolicy(brand.name);
  const total = Math.min(Math.max(1, opts.days) * Math.max(1, opts.perDay), MAX_BATCH_POSTS);
  const posts = await generateChunked(brand, platforms, total);
  if (posts.length === 0) return { ...base, skipped: "generation returned nothing" };

  const slots = scheduleOverDays({ days: opts.days, perDay: opts.perDay });
  // Cap hero videos by both the request and the brand's per-horizon policy
  // (kids ~1/week; business unlimited).
  const policyCap = maxVideosForHorizon(brand.name, opts.days);
  let heroLeft = Math.min(Math.max(0, Math.floor(opts.videoCount)), Number.isFinite(policyCap) ? policyCap : Number.MAX_SAFE_INTEGER);

  let scheduled = 0;
  let draft = 0;
  let heroVideosQueued = 0;
  let imagesQueued = 0;

  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    const scheduledAt = slots[i] ?? slots[slots.length - 1];
    const { status: approval } = evaluateApproval({
      copy: post.caption,
      riskLevel: post.riskLevel,
      bannedWords: brand.banned_words,
      autonomyMode: brand.autonomy_mode as "manual" | "semi_autonomous" | "fully_autonomous",
      audience: policy.audience,
    });

    const plan = planPost({ approval, platform: post.platform, canHero: heroLeft > 0, imageFirst: policy.imageFirst });

    let videoAssetId: string | null = null;
    let queuedHero = false;
    if (plan.queueHero) {
      const assetId = crypto.randomUUID();
      const { error: assetError } = await service.from("social_video_assets").insert({
        id: assetId,
        brand_id: brand.id,
        raw_path: `${brand.id}/generated/${assetId}.mp4`,
        status: "generating",
        notes: BATCH_HERO_NOTE,
      });
      if (!assetError) {
        videoAssetId = assetId;
        queuedHero = true;
        heroLeft--;
      }
    }

    await service.from("social_content").insert({
      brand_id: brand.id,
      platform: post.platform,
      hook: post.hook,
      caption: post.caption,
      hashtags: post.hashtags,
      risk_level: post.riskLevel,
      generated_by: "autonomous",
      status: plan.status,
      scheduled_at: scheduledAt,
      video_asset_id: videoAssetId,
      auto_image: plan.autoImage,
    });

    if (queuedHero) heroVideosQueued++;
    if (plan.autoImage) imagesQueued++;
    if (plan.status === "scheduled") scheduled++;
    else draft++;
  }

  return { ...base, posts: posts.length, scheduled, draft, heroVideosQueued, imagesQueued };
}
