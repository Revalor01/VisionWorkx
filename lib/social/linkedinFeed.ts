import { timingSafeEqual } from "crypto";
import type { LinkedInPost, LinkedInProduct } from "@/lib/database.types";
import { PRODUCTS_SITE, productPage } from "@/lib/social/productRule";

// LinkedIn scheduling via Zapier (free plan): the owner approves a post and
// gives it a time in /admin/social → LinkedIn; once that time passes the post
// shows up in a token-protected RSS feed (/api/social/linkedin/feed) that one
// Zap per LinkedIn account polls (every ~15 min on the free plan): the
// Revalor LLC company page and the owner's personal profile.
//
// Zapier's free plan can't call back to say "posted", so a post that has been
// due for MARK_POSTED_AFTER_MS is marked posted the next time the feed is read
// (Zapier has had at least one poll to pick it up by then). Zapier dedupes
// items by <guid>, so a post can't go out twice.

/** How far back the feed looks for due posts. */
export const FEED_WINDOW_MS = 48 * 60 * 60 * 1000;
/** A due post is treated as picked up by Zapier after this long. */
export const MARK_POSTED_AFTER_MS = 30 * 60 * 1000;

type FeedPost = Pick<LinkedInPost, "id" | "hook" | "caption" | "hashtags" | "product" | "scheduled_at"> &
  Partial<Pick<LinkedInPost, "image_path" | "status" | "posted_at">>;

// Two LinkedIn accounts post the same approved post, each from its own Zap
// polling its own feed URL: "page" (Revalor LLC company page, Create Company
// Update; the default, so the original feed URL keeps working) and
// "profile" (the owner's personal profile, Create Share Update). Each
// account gets its own tracked /go link so Performance can split clicks.
export const LINKEDIN_ACCOUNTS = ["page", "profile"] as const;
export type LinkedInAccount = (typeof LINKEDIN_ACCOUNTS)[number];

/** ?account= value → account; anything else (incl. missing) is the company page. */
export function parseAccount(v: string | null | undefined): LinkedInAccount {
  return v === "profile" ? "profile" : "page";
}

/** short_links.platform for an account's tracked link. */
export const accountPlatform = (a: LinkedInAccount) => `linkedin_${a}`;
/** short_links.campaign tying a tracked link to its LinkedIn post. */
export const postCampaign = (postId: string) => `linkedin:${postId}`;

/** The products-site page a LinkedIn post's product lives on (company posts → the site home). */
export function linkedinProductPage(product: LinkedInProduct): string {
  if (product === "revalor") return PRODUCTS_SITE;
  return productPage(product === "revalor_consulting" ? "consulting" : product);
}

/**
 * Posts the feed lists: still approved, or already marked posted BY THE FEED
 * (posted_at = scheduled_at). The second kind matters because two Zaps read
 * the feed: once one read marks a post posted, the other Zap must still see
 * it on its next poll. A post marked posted by hand has a different
 * posted_at, so it's left out and never sent automatically.
 */
export function feedVisible<T extends Pick<FeedPost, "scheduled_at"> & Partial<Pick<FeedPost, "status" | "posted_at">>>(posts: T[]): T[] {
  return posts.filter((p) => {
    if (!p.status || p.status === "approved") return true;
    if (p.status !== "posted" || !p.posted_at || !p.scheduled_at) return false;
    return new Date(p.posted_at).getTime() === new Date(p.scheduled_at).getTime();
  });
}

/** How long the feed's signed image links stay valid (Zapier fetches right after polling). */
export const FEED_IMAGE_URL_TTL_SECONDS = 60 * 60;

function imageMime(path: string): string {
  return path.endsWith(".png") ? "image/png" : "image/jpeg";
}

/** Constant-time check of the ?token= against LINKEDIN_FEED_TOKEN. Unset secret = always false. */
export function feedTokenValid(provided: string | null | undefined, secret: string | undefined): boolean {
  if (!secret || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * The full post text as it should appear on LinkedIn: hook, caption, the
 * product link (hard rule: every post links to its product page; skipped if
 * the caption already has a products-site link), hashtags.
 */
export function postText(p: Pick<FeedPost, "hook" | "caption" | "hashtags">, link?: string | null): string {
  const hook = (p.hook ?? "").trim();
  const caption = p.caption.trim();
  // Some captions already open with the hook; don't print it twice.
  let body = hook && !caption.startsWith(hook) ? `${hook}\n\n${caption}` : caption;
  if (link && !caption.includes("revalorllc.com")) body = `${body}\n\nLearn more: ${link}`;
  const tags = p.hashtags
    .map((h) => h.trim().replace(/^#+/, ""))
    .filter(Boolean)
    .map((h) => `#${h}`)
    .join(" ");
  return tags ? `${body}\n\n${tags}` : body;
}

/** Posts whose scheduled time is within the feed window and not in the future. */
export function duePosts<T extends Pick<FeedPost, "scheduled_at">>(posts: T[], now: number): T[] {
  return posts
    .filter((p) => {
      if (!p.scheduled_at) return false;
      const t = new Date(p.scheduled_at).getTime();
      return t <= now && t >= now - FEED_WINDOW_MS;
    })
    .sort((a, b) => new Date(b.scheduled_at!).getTime() - new Date(a.scheduled_at!).getTime());
}

/** Due, still-approved posts that Zapier has had time to pick up and can be marked posted. */
export function postsToMarkPosted<T extends Pick<FeedPost, "scheduled_at"> & Partial<Pick<FeedPost, "status">>>(posts: T[], now: number): T[] {
  return duePosts(posts, now).filter(
    (p) => (!p.status || p.status === "approved") && new Date(p.scheduled_at!).getTime() <= now - MARK_POSTED_AFTER_MS,
  );
}

// XML 1.0 forbids most control characters; one pasted into a caption would
// make the whole feed unreadable, so drop them (tab/newline/CR are allowed).
const XML_INVALID = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;

function xml(s: string): string {
  return s.replace(XML_INVALID, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

/**
 * RSS 2.0 feed of due posts. <guid> is post id + scheduled time, so a
 * rescheduled post is a new item but the same schedule is never repeated.
 * <description> is the plain post text (Zapier maps it to "Update Content").
 * A post with an image gets an <enclosure> (imageUrls: post id -> signed URL),
 * which Zapier maps to the LinkedIn step's "Image" (type post_media).
 * links: post id -> that account's tracked product link; it's added to the
 * text and is the item's <link> (the profile Zap's "Content - URL").
 */
export function buildFeedXml(
  posts: FeedPost[],
  siteUrl: string,
  now: number,
  imageUrls: Record<string, string> = {},
  links: Record<string, string> = {},
  account: LinkedInAccount = "page",
): string {
  const items = duePosts(feedVisible(posts), now)
    .map((p) => {
      const text = postText(p, links[p.id]);
      const title = (p.hook ?? "").trim() || p.caption.trim().split("\n")[0].slice(0, 100);
      return [
        "    <item>",
        `      <title>${xml(title)}</title>`,
        ...(links[p.id] ? [`      <link>${xml(links[p.id])}</link>`] : []),
        `      <description>${xml(text)}</description>`,
        `      <guid isPermaLink="false">linkedin-${xml(p.id)}-${new Date(p.scheduled_at!).getTime()}</guid>`,
        `      <pubDate>${new Date(p.scheduled_at!).toUTCString()}</pubDate>`,
        `      <category>${xml(p.product)}</category>`,
        ...(imageUrls[p.id] && p.image_path
          ? [`      <enclosure url="${xml(imageUrls[p.id])}" length="0" type="${imageMime(p.image_path)}" />`]
          : []),
        "    </item>",
      ].join("\n");
    })
    .join("\n");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0">',
    "  <channel>",
    `    <title>Revalor LLC — scheduled LinkedIn posts (${account === "profile" ? "personal profile" : "company page"})</title>`,
    `    <link>${xml(siteUrl)}</link>`,
    "    <description>Approved LinkedIn posts whose scheduled time has arrived.</description>",
    `    <lastBuildDate>${new Date(now).toUTCString()}</lastBuildDate>`,
    items,
    "  </channel>",
    "</rss>",
    "",
  ]
    .filter((l) => l !== "")
    .join("\n") + "\n";
}
