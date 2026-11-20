import { timingSafeEqual } from "crypto";
import type { LinkedInPost } from "@/lib/database.types";

// LinkedIn scheduling via Zapier (free plan): the owner approves a post and
// gives it a time in /admin/social → LinkedIn; once that time passes the post
// shows up in a token-protected RSS feed (/api/social/linkedin/feed) that an
// "RSS by Zapier → LinkedIn Create Company Update" Zap polls (every ~15 min on
// the free plan) and posts to the Revalor LLC page.
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
  Partial<Pick<LinkedInPost, "image_path">>;

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

/** The full post text as it should appear on LinkedIn: hook, caption, hashtags. */
export function postText(p: Pick<FeedPost, "hook" | "caption" | "hashtags">): string {
  const hook = (p.hook ?? "").trim();
  const caption = p.caption.trim();
  // Some captions already open with the hook; don't print it twice.
  const body = hook && !caption.startsWith(hook) ? `${hook}\n\n${caption}` : caption;
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

/** Due posts that Zapier has had time to pick up and can be marked posted. */
export function postsToMarkPosted<T extends Pick<FeedPost, "scheduled_at">>(posts: T[], now: number): T[] {
  return duePosts(posts, now).filter((p) => new Date(p.scheduled_at!).getTime() <= now - MARK_POSTED_AFTER_MS);
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
 */
export function buildFeedXml(posts: FeedPost[], siteUrl: string, now: number, imageUrls: Record<string, string> = {}): string {
  const items = duePosts(posts, now)
    .map((p) => {
      const text = postText(p);
      const title = (p.hook ?? "").trim() || p.caption.trim().split("\n")[0].slice(0, 100);
      return [
        "    <item>",
        `      <title>${xml(title)}</title>`,
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
    "    <title>Revalor LLC — scheduled LinkedIn posts</title>",
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
