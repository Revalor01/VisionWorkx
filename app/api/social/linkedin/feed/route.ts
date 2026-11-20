import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import {
  FEED_IMAGE_URL_TTL_SECONDS,
  FEED_WINDOW_MS,
  accountPlatform,
  buildFeedXml,
  duePosts,
  feedTokenValid,
  feedVisible,
  linkedinProductPage,
  parseAccount,
  postCampaign,
  postsToMarkPosted,
} from "@/lib/social/linkedinFeed";
import { LINKEDIN_IMAGE_BUCKET } from "@/lib/social/linkedinImage";
import { getOrCreateShortLink, shortLinkBase, withUtm } from "@/lib/social/shortLinks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// RSS feed of approved LinkedIn posts whose scheduled time has arrived, for a
// Zapier "RSS by Zapier → LinkedIn" Zap per account (free plan):
// ?account=page (default) → Create Company Update on the Revalor LLC page,
// ?account=profile → Create Share Update on the owner's personal profile.
// Machine-to-machine: ?token= must match LINKEDIN_FEED_TOKEN (RSS readers
// can't send headers). Anyone else gets a bare 404 so the route doesn't
// advertise itself. See lib/social/linkedinFeed.ts for the rules.

export async function GET(req: NextRequest) {
  if (!feedTokenValid(req.nextUrl.searchParams.get("token"), process.env.LINKEDIN_FEED_TOKEN)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const account = parseAccount(req.nextUrl.searchParams.get("account"));
  const now = Date.now();
  const service = createServiceClient();
  // "posted" too: feedVisible keeps the ones the feed itself marked posted, so
  // the other account's Zap still sees a post after this one marked it.
  const { data, error } = await service
    .from("linkedin_posts")
    .select("id, hook, caption, hashtags, product, scheduled_at, image_path, status, posted_at")
    .in("status", ["approved", "posted"])
    .not("scheduled_at", "is", null)
    .gte("scheduled_at", new Date(now - FEED_WINDOW_MS).toISOString())
    .lte("scheduled_at", new Date(now).toISOString());

  if (error) {
    console.error("[social/linkedin/feed] read failed:", error.message);
    return new NextResponse("Feed unavailable", { status: 503 });
  }
  const posts = feedVisible(data ?? []);
  const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://vision-workx.vercel.app";

  // Short-lived signed links for due posts' images. A failed link just means
  // that post goes out text-only rather than breaking the whole feed.
  const imageUrls: Record<string, string> = {};
  for (const p of duePosts(posts, now)) {
    if (!p.image_path) continue;
    const { data: signed, error: signError } = await service.storage
      .from(LINKEDIN_IMAGE_BUCKET)
      .createSignedUrl(p.image_path, FEED_IMAGE_URL_TTL_SECONDS);
    if (signed?.signedUrl) imageUrls[p.id] = signed.signedUrl;
    else console.error("[social/linkedin/feed] image link failed:", p.id, signError?.message);
  }

  // One tracked /go link per post per account (reused on every poll), so the
  // post links to its product page and Performance can count clicks per
  // account. A failed link falls back to the plain product page.
  const links: Record<string, string> = {};
  const platform = accountPlatform(account);
  for (const p of duePosts(posts, now)) {
    const destination = withUtm(linkedinProductPage(p.product), { source: "linkedin", campaign: "linkedin", content: account });
    const campaign = postCampaign(p.id);
    const { data: existing } = await service
      .from("short_links")
      .select("code")
      .eq("campaign", campaign)
      .eq("platform", platform)
      .limit(1)
      .maybeSingle();
    if (existing) {
      links[p.id] = `${shortLinkBase()}/go/${existing.code}`;
      continue;
    }
    try {
      links[p.id] = await getOrCreateShortLink(service, { destinationUrl: destination, platform, campaign });
    } catch (e) {
      console.error("[social/linkedin/feed] short link failed:", p.id, (e as Error).message);
      links[p.id] = destination;
    }
  }

  const body = buildFeedXml(posts, siteUrl, now, imageUrls, links, account);

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
