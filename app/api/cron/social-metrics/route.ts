import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { getFacebookPostMetrics, getInstagramMediaMetrics, type PostMetrics } from "@/lib/social/meta";

export const runtime = "nodejs";
export const maxDuration = 300;

// Snapshots per-post performance for everything posted in the last 21
// days (engagement keeps moving for ~2 weeks). Facebook + Instagram
// metrics come straight from the Graph API — TikTok/YouTube go through
// SocialAPI.ai whose insights aren't wired up (see topicSeeds.ts), so
// those posts only get our redirector's tracked_clicks for now.
const WINDOW_DAYS = 21;
const MAX_POSTS_PER_RUN = 150;

export async function GET(req: NextRequest) {
  if ((req.headers.get("authorization") ?? "") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = createServiceClient();
  const since = new Date(Date.now() - WINDOW_DAYS * 864e5).toISOString();
  const today = new Date().toISOString().slice(0, 10);

  const { data: posts } = await service
    .from("social_content")
    .select("id, brand_id, platform, platform_post_id, posted_at")
    .eq("status", "posted")
    .not("platform_post_id", "is", null)
    .gte("posted_at", since)
    .order("posted_at", { ascending: false })
    .limit(MAX_POSTS_PER_RUN);

  if (!posts?.length) return NextResponse.json({ processed: 0 });

  // brand_id -> fb page token + ig business id (fetched once per brand)
  const brandCache = new Map<string, { token: string | null; igBusinessId: string | null }>();
  async function brandConn(brandId: string) {
    const hit = brandCache.get(brandId);
    if (hit) return hit;
    const [{ data: conn }, { data: brand }] = await Promise.all([
      service.from("social_connections").select("fb_page_access_token").eq("brand_id", brandId).maybeSingle(),
      service.from("social_brands").select("ig_business_id").eq("id", brandId).maybeSingle(),
    ]);
    const val = { token: conn?.fb_page_access_token ?? null, igBusinessId: brand?.ig_business_id ?? null };
    brandCache.set(brandId, val);
    return val;
  }

  let updated = 0;
  let withNative = 0;

  for (const post of posts) {
    // Our redirector clicks for this post (real humans only).
    const { data: linkRows } = await service
      .from("short_links")
      .select("id")
      .eq("social_content_id", post.id);
    let trackedClicks: number | null = null;
    if (linkRows?.length) {
      const ids = linkRows.map((r) => r.id);
      const { count } = await service
        .from("link_clicks")
        .select("id", { count: "exact", head: true })
        .in("short_link_id", ids)
        .eq("is_bot", false);
      trackedClicks = count ?? 0;
    }

    let m: PostMetrics | null = null;
    let source = "redirect_only";
    const { token, igBusinessId } = await brandConn(post.brand_id);

    if (post.platform === "facebook" && token && post.platform_post_id) {
      m = await getFacebookPostMetrics(post.platform_post_id, token);
      source = "meta_graph";
    } else if (
      post.platform === "instagram" &&
      token &&
      igBusinessId &&
      post.platform_post_id &&
      /^\d+$/.test(post.platform_post_id)
    ) {
      m = await getInstagramMediaMetrics(post.platform_post_id, token);
      source = "meta_graph";
    }

    if (source === "meta_graph") withNative++;

    const eng =
      m && m.reach && m.reach > 0
        ? ((m.likes ?? 0) + (m.comments ?? 0) + (m.shares ?? 0) + (m.saves ?? 0)) / m.reach
        : null;

    const row = {
      social_content_id: post.id,
      captured_on: today,
      source,
      impressions: m?.impressions ?? null,
      reach: m?.reach ?? null,
      likes: m?.likes ?? null,
      comments: m?.comments ?? null,
      shares: m?.shares ?? null,
      saves: m?.saves ?? null,
      video_views: m?.videoViews ?? null,
      link_clicks: m?.linkClicks ?? null,
      tracked_clicks: trackedClicks,
      engagement_rate: eng,
      raw: m?.raw ?? {},
      updated_at: new Date().toISOString(),
    };

    const { error } = await service
      .from("social_content_metrics")
      .upsert(row, { onConflict: "social_content_id,captured_on" });
    if (error) {
      console.error(`[social-metrics] upsert ${post.id}:`, error.message);
    } else {
      updated++;
    }
  }

  return NextResponse.json({ processed: posts.length, updated, withNative });
}
