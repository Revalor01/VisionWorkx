import type { createServiceClient } from "@/lib/supabase";

// Facebook Page follower counts. Facebook shares post reach and engagement only once
// a Page has roughly this many followers; below it, follower count and our own tracked
// link clicks are the only real numbers. Snapshots go in vw_social_page_followers.

export const FB_STATS_FOLLOWER_THRESHOLD = 100;

type Service = ReturnType<typeof createServiceClient>;
export type PageFollowers = { brandId: string; pageId: string; pageName: string | null; followers: number };
export type FollowerPoint = { date: string; followers: number };

// Not in the generated Database types yet; read/written through an untyped handle.
const followersTable = (service: Service) =>
  (service as unknown as { from: (t: string) => ReturnType<Service["from"]> }).from("vw_social_page_followers");

/** Live follower count of every brand's connected Facebook Page (asked with each Page's own token). */
export async function fetchPageFollowers(service: Service): Promise<PageFollowers[]> {
  const [{ data: brands }, { data: connections }] = await Promise.all([
    service.from("social_brands").select("id, fb_page_id").not("fb_page_id", "is", null),
    service.from("social_connections").select("brand_id, fb_page_access_token"),
  ]);
  const out = await Promise.all(
    (brands ?? []).map(async (b): Promise<PageFollowers | null> => {
      const token = connections?.find((c) => c.brand_id === b.id)?.fb_page_access_token;
      if (!token) return null;
      try {
        const url = new URL(`https://graph.facebook.com/v21.0/${b.fb_page_id}`);
        url.searchParams.set("fields", "name,followers_count,fan_count");
        url.searchParams.set("access_token", token);
        const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
        const page = (await res.json()) as { name?: string; followers_count?: number; fan_count?: number };
        const followers = page.followers_count ?? page.fan_count;
        return typeof followers === "number" ? { brandId: b.id, pageId: b.fb_page_id!, pageName: page.name ?? null, followers } : null;
      } catch {
        return null;
      }
    })
  );
  return out.filter((x): x is PageFollowers => x !== null);
}

/** Saves today's follower count per brand (one row per brand/day; later runs update it). Never throws. */
export async function snapshotPageFollowers(service: Service): Promise<number> {
  try {
    const rows = await fetchPageFollowers(service);
    if (!rows.length) return 0;
    const capturedOn = new Date().toISOString().slice(0, 10);
    const { error } = await followersTable(service).upsert(
      rows.map((r) => ({ brand_id: r.brandId, platform: "facebook", page_id: r.pageId, followers: r.followers, captured_on: capturedOn, captured_at: new Date().toISOString() })) as never,
      { onConflict: "brand_id,platform,captured_on" }
    );
    if (error) throw error;
    return rows.length;
  } catch (err) {
    console.error("[pageFollowers] snapshot failed:", (err as Error).message);
    return 0;
  }
}

/** Follower history per brand since `sinceDay` (YYYY-MM-DD), oldest first. [] if the table isn't there yet. */
export async function loadFollowerHistory(service: Service, sinceDay: string): Promise<Map<string, FollowerPoint[]>> {
  const map = new Map<string, FollowerPoint[]>();
  try {
    const { data, error } = await followersTable(service)
      .select("brand_id, followers, captured_on")
      .eq("platform", "facebook")
      .gte("captured_on", sinceDay)
      .order("captured_on", { ascending: true });
    if (error) throw error;
    for (const r of (data ?? []) as unknown as { brand_id: string; followers: number; captured_on: string }[]) {
      map.set(r.brand_id, [...(map.get(r.brand_id) ?? []), { date: r.captured_on, followers: r.followers }]);
    }
  } catch (err) {
    console.error("[pageFollowers] history read failed:", (err as Error).message);
  }
  return map;
}

/** Change over the window: latest minus first snapshot (null with fewer than two). Pure. */
export function followerChange(history: FollowerPoint[]): number | null {
  return history.length >= 2 ? history[history.length - 1].followers - history[0].followers : null;
}
