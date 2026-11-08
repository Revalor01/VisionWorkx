import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient, createServiceClient } from "@/lib/supabase";
import { ADMIN_EMAIL, isAdmin, isAdminOrEditor } from "@/lib/social/authGuard";
import { ADMIN_SSO_COOKIE, verifySessionCookie } from "@/lib/adminSso";
import {
  getBrandPostPerformance,
  performanceScore,
  rawEngagements,
  type PostPerformance,
} from "@/lib/social/performance";
import { POST_PRODUCTS, resolvePostProduct } from "@/lib/social/productRule";
import { FB_STATS_FOLLOWER_THRESHOLD, fetchPageFollowers, followerChange, loadFollowerHistory } from "@/lib/social/pageFollowers";

export const runtime = "nodejs";

const num = (xs: (number | null | undefined)[]) =>
  xs.reduce((a: number, b) => a + (b ?? 0), 0);
const avg = (xs: number[]) => (xs.length ? num(xs) / xs.length : null);

export async function GET(req: NextRequest) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const cookieStore = await cookies();
  const isSso = verifySessionCookie(cookieStore.get(ADMIN_SSO_COOKIE)?.value, ADMIN_EMAIL);
  const allowed = isSso || isAdmin(user) || (await isAdminOrEditor(user));
  if (!allowed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceClient();

  const daysParam = Number(req.nextUrl.searchParams.get("days"));
  const days = [7, 30, 90].includes(daysParam) ? daysParam : 30;
  const brandId = req.nextUrl.searchParams.get("brandId") || null;

  const { data: allBrands } = await service.from("social_brands").select("id, name");
  const nameOf = new Map((allBrands ?? []).map((b) => [b.id, b.name]));
  const brandIds: string[] = brandId ? [brandId] : (allBrands ?? []).map((b) => b.id);

  const perBrand = await Promise.all(
    brandIds.map((id) => getBrandPostPerformance(service, id, days))
  );
  const posts: (PostPerformance & { brandId: string })[] = perBrand.flatMap(
    (list, i) => list.map((p) => ({ ...p, brandId: brandIds[i] }))
  );

  const engRates = posts
    .map((p) => p.engagementRate)
    .filter((x): x is number => x != null);

  // Facebook's own numbers (reach, likes…) — empty for Pages under ~100 followers.
  const hasNative = (p: PostPerformance) =>
    p.reach != null || p.impressions != null || p.likes != null || p.comments != null || p.shares != null || p.engagementRate != null;

  const summary = {
    postCount: posts.length,
    // Posts Facebook/Instagram returned stats for (not our tracked clicks, counted separately).
    postsWithMetrics: posts.filter(hasNative).length,
    nativeMetricsAvailable: posts.some(hasNative),
    totalReach: num(posts.map((p) => p.reach)),
    totalImpressions: num(posts.map((p) => p.impressions)),
    totalEngagements: num(posts.map(rawEngagements)),
    totalTrackedClicks: num(posts.map((p) => p.trackedClicks)),
    totalNativeLinkClicks: num(posts.map((p) => p.linkClicks)),
    avgEngagementRate: avg(engRates),
  };

  // Tracked link clicks by brand and by product — the real signal while Facebook shares no stats.
  const byBrand = brandIds
    .map((id) => {
      const ps = posts.filter((p) => p.brandId === id);
      return { brandId: id, name: nameOf.get(id) ?? "—", postCount: ps.length, totalTrackedClicks: num(ps.map((p) => p.trackedClicks)) };
    })
    .filter((b) => b.postCount > 0)
    .sort((a, b) => b.totalTrackedClicks - a.totalTrackedClicks);
  const productTotals = new Map<string, { postCount: number; clicks: number }>();
  for (const p of posts) {
    const slug = resolvePostProduct({ link_url: p.linkUrl, hook: p.hook, caption: p.caption }, nameOf.get(p.brandId) ?? "") ?? "other";
    const t = productTotals.get(slug) ?? { postCount: 0, clicks: 0 };
    productTotals.set(slug, { postCount: t.postCount + 1, clicks: t.clicks + (p.trackedClicks ?? 0) });
  }
  const byProduct = [...productTotals.entries()]
    .map(([slug, t]) => ({
      product: slug === "other" ? "No product named" : (POST_PRODUCTS[slug]?.name ?? slug),
      postCount: t.postCount,
      totalTrackedClicks: t.clicks,
      clicksPerPost: t.postCount ? t.clicks / t.postCount : 0,
    }))
    .sort((a, b) => b.totalTrackedClicks - a.totalTrackedClicks);

  // Facebook followers per brand Page: live count now, plus the daily snapshots in this window.
  const sinceDay = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
  const [live, history] = await Promise.all([fetchPageFollowers(service), loadFollowerHistory(service, sinceDay)]);
  const followers = live
    .filter((f) => brandIds.includes(f.brandId))
    .map((f) => {
      const h = history.get(f.brandId) ?? [];
      return { brandId: f.brandId, brand: nameOf.get(f.brandId) ?? "—", pageName: f.pageName, followers: f.followers, change: followerChange(h), history: h };
    })
    .sort((a, b) => b.followers - a.followers);

  const platforms = [...new Set(posts.map((p) => p.platform))];
  const byPlatform = platforms.map((platform) => {
    const ps = posts.filter((p) => p.platform === platform);
    return {
      platform,
      postCount: ps.length,
      totalReach: num(ps.map((p) => p.reach)),
      totalEngagements: num(ps.map(rawEngagements)),
      totalTrackedClicks: num(ps.map((p) => p.trackedClicks)),
      avgEngagementRate: avg(
        ps.map((p) => p.engagementRate).filter((x): x is number => x != null)
      ),
    };
  });

  const byHour = Array.from({ length: 24 }, (_, hour) => {
    const ps = posts.filter(
      (p) => p.postedAt && new Date(p.postedAt).getUTCHours() === hour
    );
    return {
      hour,
      postCount: ps.length,
      avgEngagementRate: avg(
        ps.map((p) => p.engagementRate).filter((x): x is number => x != null)
      ),
    };
  }).filter((x) => x.postCount > 0);

  const ranked = [...posts].sort((a, b) => performanceScore(b) - performanceScore(a));
  const topHooks = ranked
    .filter((p) => p.hook && (p.engagementRate != null || p.trackedClicks != null))
    .slice(0, 5)
    .map((p) => p.hook as string);

  return NextResponse.json({
    days,
    summary,
    byPlatform,
    byBrand,
    byProduct,
    followers,
    followerThreshold: FB_STATS_FOLLOWER_THRESHOLD,
    byHour,
    topHooks,
    posts: ranked.slice(0, 100),
  });
}
