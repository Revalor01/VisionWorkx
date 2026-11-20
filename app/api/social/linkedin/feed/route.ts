import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { FEED_WINDOW_MS, buildFeedXml, feedTokenValid, postsToMarkPosted } from "@/lib/social/linkedinFeed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// RSS feed of approved LinkedIn posts whose scheduled time has arrived, for a
// Zapier "RSS by Zapier → LinkedIn Create Company Update" Zap (free plan).
// Machine-to-machine: ?token= must match LINKEDIN_FEED_TOKEN (RSS readers
// can't send headers). Anyone else gets a bare 404 so the route doesn't
// advertise itself. See lib/social/linkedinFeed.ts for the rules.

export async function GET(req: NextRequest) {
  if (!feedTokenValid(req.nextUrl.searchParams.get("token"), process.env.LINKEDIN_FEED_TOKEN)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const now = Date.now();
  const service = createServiceClient();
  const { data, error } = await service
    .from("linkedin_posts")
    .select("id, hook, caption, hashtags, product, scheduled_at")
    .eq("status", "approved")
    .not("scheduled_at", "is", null)
    .gte("scheduled_at", new Date(now - FEED_WINDOW_MS).toISOString())
    .lte("scheduled_at", new Date(now).toISOString());

  if (error) {
    console.error("[social/linkedin/feed] read failed:", error.message);
    return new NextResponse("Feed unavailable", { status: 503 });
  }
  const posts = data ?? [];
  const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://vision-workx.vercel.app";
  const body = buildFeedXml(posts, siteUrl, now);

  // Zapier can't confirm a post, so anything due for 30+ minutes has had at
  // least one poll and is marked posted (posted_at = its scheduled time). The
  // status + scheduled_at guards keep a post that was unapproved or
  // rescheduled meanwhile from being marked.
  // This response still lists them, so the poll in progress sees every item.
  for (const p of postsToMarkPosted(posts, now)) {
    const { error: markError } = await service
      .from("linkedin_posts")
      .update({ status: "posted", posted_at: p.scheduled_at, updated_at: new Date(now).toISOString() })
      .eq("id", p.id)
      .eq("status", "approved")
      .eq("scheduled_at", p.scheduled_at!);
    if (markError) console.error("[social/linkedin/feed] mark posted failed:", p.id, markError.message);
  }

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
