// Cost model for the batch content generator. Video (Kling) is the dominant
// cost, so the whole feature is sized around it and bounded by a hard monthly
// cap. Content videos now use Kling v3.0 (~$3.36 per 10s pro+audio clip, at
// $0.336/s) — up from ~$0.84 on v2.6 — so at the default $25 cap that's ~7
// videos/month; raise SOCIAL_MEDIA_MONTHLY_BUDGET_USD for more. All
// env-overridable. Pure — no I/O.

export const VIDEO_USD = Number(process.env.SOCIAL_VIDEO_USD) || 3.36;
export const IMAGE_USD = Number(process.env.SOCIAL_IMAGE_USD) || 0.05;
// Captions are one batched Sonnet call per ~14 posts — pennies; a per-post
// figure just keeps the estimate honest rather than showing $0.
export const CAPTION_USD_PER_POST = Number(process.env.SOCIAL_CAPTION_USD) || 0.005;

export const MONTHLY_BUDGET_USD = Number(process.env.SOCIAL_MEDIA_MONTHLY_BUDGET_USD) || 25;

export interface BatchCost {
  posts: number;
  images: number;
  videos: number;
  captionUsd: number;
  imageUsd: number;
  videoUsd: number;
  totalUsd: number;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

export function estimateBatchCost(input: { posts: number; images?: number; videos?: number }): BatchCost {
  const posts = Math.max(0, Math.floor(input.posts));
  const images = Math.max(0, Math.floor(input.images ?? 0));
  const videos = Math.max(0, Math.floor(input.videos ?? 0));
  const captionUsd = round(posts * CAPTION_USD_PER_POST);
  const imageUsd = round(images * IMAGE_USD);
  const videoUsd = round(videos * VIDEO_USD);
  return { posts, images, videos, captionUsd, imageUsd, videoUsd, totalUsd: round(captionUsd + imageUsd + videoUsd) };
}

/** True when adding `addUsd` to month-to-date spend stays within the cap. */
export function withinBudget(monthToDateUsd: number, addUsd: number, cap: number = MONTHLY_BUDGET_USD): boolean {
  return monthToDateUsd + addUsd <= cap + 1e-9;
}

/** Dollars left before the monthly cap (never negative). */
export function remainingBudget(monthToDateUsd: number, cap: number = MONTHLY_BUDGET_USD): number {
  return round(Math.max(0, cap - monthToDateUsd));
}
