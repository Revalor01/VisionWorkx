import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient, createServiceClient } from "@/lib/supabase";
import { ADMIN_EMAIL, isAdmin, isAdminOrEditor } from "@/lib/social/authGuard";
import { ADMIN_SSO_COOKIE, verifySessionCookie } from "@/lib/adminSso";
import {
  getBrandPostPerformance,
  performanceScore,
  type PostPerformance,
} from "@/lib/social/performance";

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

  let brandIds: string[];
  if (brandId) {
    brandIds = [brandId];
  } else {
    const { data } = await service.from("social_brands").select("id");
    brandIds = (data ?? []).map((b) => b.id);
  }

  const perBrand = await Promise.all(
    brandIds.map((id) => getBrandPostPerformance(service, id, days))
  );
  const posts: (PostPerformance & { brandId: string })[] = perBrand.flatMap(
    (list, i) => list.map((p) => ({ ...p, brandId: brandIds[i] }))
  );

  const engRates = posts
    .map((p) => p.engagementRate)
    .filter((x): x is number => x != null);

  const summary = {
    postCount: posts.length,
    postsWithMetrics: posts.filter(
      (p) => p.reach != null || p.engagementRate != null || p.trackedClicks != null
    ).length,
    totalReach: num(posts.map((p) => p.reach)),
    totalImpressions: num(posts.map((p) => p.impressions)),
    totalTrackedClicks: num(posts.map((p) => p.trackedClicks)),
    totalNativeLinkClicks: num(posts.map((p) => p.linkClicks)),
    avgEngagementRate: avg(engRates),
  };

  const platforms = [...new Set(posts.map((p) => p.platform))];
  const byPlatform = platforms.map((platform) => {
    const ps = posts.filter((p) => p.platform === platform);
    return {
      platform,
      postCount: ps.length,
      totalReach: num(ps.map((p) => p.reach)),
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
    byHour,
    topHooks,
    posts: ranked.slice(0, 100),
  });
}
