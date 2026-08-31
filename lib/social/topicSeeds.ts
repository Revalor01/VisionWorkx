import type { createServiceClient } from "@/lib/supabase";
import type { SocialBrand } from "@/lib/database.types";
import { getBrandPostPerformance, performanceScore } from "@/lib/social/performance";

const MAX_TOPICS = 3;
const MAX_PERFORMANCE_SEEDS = 2;
const LOOKBACK_DAYS = 7;
const METRICS_LOOKBACK_DAYS = 30;

type Service = ReturnType<typeof createServiceClient>;

// Prefer real per-post metrics (social_content_metrics, populated by
// app/api/cron/social-metrics) — the best-performing recent posts become
// "make more like this" seeds. Falls back to inbound DM/comment volume
// as a proxy when there isn't enough measured data yet (new brand, or
// the metrics cron hasn't caught up).
export async function getPerformanceTopicSeeds(
  service: Service,
  brandId: string
): Promise<string[]> {
  const fromMetrics = await seedsFromMetrics(service, brandId);
  if (fromMetrics.length > 0) return fromMetrics;
  return seedsFromInboundVolume(service, brandId);
}

async function seedsFromMetrics(service: Service, brandId: string): Promise<string[]> {
  const perf = await getBrandPostPerformance(service, brandId, METRICS_LOOKBACK_DAYS);
  const measured = perf.filter((p) => p.engagementRate != null || p.trackedClicks != null);
  if (measured.length < 3) return [];

  return measured
    .sort((a, b) => performanceScore(b) - performanceScore(a))
    .slice(0, MAX_PERFORMANCE_SEEDS)
    .map((p) => {
      const bits: string[] = [];
      if (p.engagementRate != null) bits.push(`${(p.engagementRate * 100).toFixed(1)}% engagement`);
      if (p.trackedClicks) bits.push(`${p.trackedClicks} link clicks`);
      const stat = bits.length ? ` (${bits.join(", ")} on ${p.platform})` : "";
      const angle = p.hook?.trim() || p.caption.slice(0, 120);
      return `more content in the vein of your recent top performer: "${angle}"${stat}`;
    });
}

async function seedsFromInboundVolume(service: Service, brandId: string): Promise<string[]> {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 864e5).toISOString();
  const { data: items } = await service
    .from("social_inbox_items")
    .select("platform")
    .eq("brand_id", brandId)
    .gte("created_at", since);
  if (!items || items.length === 0) return [];

  const byPlatform = new Map<string, number>();
  for (const item of items) {
    byPlatform.set(item.platform, (byPlatform.get(item.platform) ?? 0) + 1);
  }

  return Array.from(byPlatform.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_PERFORMANCE_SEEDS)
    .map(
      ([platform, count]) =>
        `content that answers the kind of questions people are DMing/commenting about on ${platform} lately (${count} messages this week)`
    );
}

export async function getTodaysTopics(service: Service, brand: SocialBrand): Promise<string[]> {
  const performanceSeeds = await getPerformanceTopicSeeds(service, brand.id);
  const evergreen = brand.content_topics ?? [];
  return [...performanceSeeds, ...evergreen].slice(0, MAX_TOPICS);
}
