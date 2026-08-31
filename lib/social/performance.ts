import type { createServiceClient } from "@/lib/supabase";

type Service = ReturnType<typeof createServiceClient>;

export interface PostPerformance {
  contentId: string;
  platform: string;
  postedAt: string | null;
  hook: string | null;
  caption: string;
  reach: number | null;
  impressions: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  engagementRate: number | null;
  trackedClicks: number | null;
  linkClicks: number | null;
}

export const rawEngagements = (p: PostPerformance): number =>
  (p.likes ?? 0) + (p.comments ?? 0) + (p.shares ?? 0);

/** A composite "how did this do" score. Engagement rate leads when we have
 *  reach to compute it (Instagram); Facebook has no post-level reach, so
 *  raw engagement counts carry it there. Tracked link clicks are a boost
 *  so posts that actually drove traffic rank up. */
export function performanceScore(p: PostPerformance): number {
  return (
    (p.engagementRate ?? 0) * 100 +
    rawEngagements(p) * 0.05 +
    (p.trackedClicks ?? 0) * 0.2
  );
}

/** Latest metric snapshot per post for a brand over the last `days`. */
export async function getBrandPostPerformance(
  service: Service,
  brandId: string,
  days = 30
): Promise<PostPerformance[]> {
  const since = new Date(Date.now() - days * 864e5).toISOString();

  const { data: posts } = await service
    .from("social_content")
    .select("id, platform, posted_at, hook, caption")
    .eq("brand_id", brandId)
    .eq("status", "posted")
    .gte("posted_at", since);
  if (!posts?.length) return [];

  const { data: metrics } = await service
    .from("social_content_metrics")
    .select(
      "social_content_id, reach, impressions, likes, comments, shares, engagement_rate, tracked_clicks, link_clicks, captured_on"
    )
    .in(
      "social_content_id",
      posts.map((p) => p.id)
    )
    .order("captured_on", { ascending: false });

  // newest snapshot per post
  const latest = new Map<string, NonNullable<typeof metrics>[number]>();
  for (const m of metrics ?? []) {
    if (!latest.has(m.social_content_id)) latest.set(m.social_content_id, m);
  }

  return posts.map((p) => {
    const m = latest.get(p.id);
    return {
      contentId: p.id,
      platform: p.platform,
      postedAt: p.posted_at,
      hook: p.hook,
      caption: p.caption,
      reach: m?.reach ?? null,
      impressions: m?.impressions ?? null,
      likes: m?.likes ?? null,
      comments: m?.comments ?? null,
      shares: m?.shares ?? null,
      engagementRate: m?.engagement_rate ?? null,
      trackedClicks: m?.tracked_clicks ?? null,
      linkClicks: m?.link_clicks ?? null,
    };
  });
}

/** Hooks from the best-performing recent posts, for feeding the content
 *  generator as "what's working" examples. Returns [] when there isn't
 *  enough measured data yet. */
export async function getTopHooks(
  service: Service,
  brandId: string,
  { limit = 5, days = 30 }: { limit?: number; days?: number } = {}
): Promise<string[]> {
  const perf = await getBrandPostPerformance(service, brandId, days);
  const measured = perf.filter(
    (p) => p.hook && (p.engagementRate != null || p.trackedClicks != null)
  );
  if (measured.length < 3) return [];
  return measured
    .sort((a, b) => performanceScore(b) - performanceScore(a))
    .slice(0, limit)
    .map((p) => p.hook as string);
}
