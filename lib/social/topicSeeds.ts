import type { createServiceClient } from "@/lib/supabase";
import type { SocialBrand } from "@/lib/database.types";

const MAX_TOPICS = 3;
const MAX_PERFORMANCE_SEEDS = 2;
const LOOKBACK_DAYS = 7;

// Real per-post impressions/clicks/shares data isn't wired up yet (no
// SocialAPI.ai insights endpoint in this codebase, and that API's docs
// are known-unreliable — see lib/social/socialApi.ts's webhook comment
// for a prior example of docs not matching reality). Until a real
// insights call has been tested live, this uses inbound engagement
// volume — which platforms/topics are actually generating DMs and
// comments — as a lightweight, honest proxy signal instead.
export async function getPerformanceTopicSeeds(
  service: ReturnType<typeof createServiceClient>,
  brandId: string
): Promise<string[]> {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: items } = await service
    .from("social_inbox_items")
    .select("platform, message_text")
    .eq("brand_id", brandId)
    .gte("created_at", since);

  if (!items || items.length === 0) return [];

  const byPlatform = new Map<string, number>();
  for (const item of items) {
    byPlatform.set(item.platform, (byPlatform.get(item.platform) ?? 0) + 1);
  }

  const topPlatforms = Array.from(byPlatform.entries()).sort((a, b) => b[1] - a[1]).slice(0, MAX_PERFORMANCE_SEEDS);

  return topPlatforms.map(
    ([platform, count]) => `content that answers the kind of questions people are DMing/commenting about on ${platform} lately (${count} messages this week)`
  );
}

export async function getTodaysTopics(service: ReturnType<typeof createServiceClient>, brand: SocialBrand): Promise<string[]> {
  const performanceSeeds = await getPerformanceTopicSeeds(service, brand.id);
  const evergreen = brand.content_topics ?? [];
  return [...performanceSeeds, ...evergreen].slice(0, MAX_TOPICS);
}
