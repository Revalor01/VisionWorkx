// Validates a pasted campaign of finished posts for /admin/social → Import
// posts. Pure (no I/O) so it's unit-tested; app/api/social/content/import
// resolves the brand and inserts. Facebook posts are scheduled straight away;
// Instagram posts land as drafts on their planned time, because Instagram
// can't publish without an image and a failed publish pauses the brand's
// autonomy. With autoImages (default "instagram"), /api/cron/social-images
// makes the image and schedules the draft; otherwise the operator does.

export const MAX_IMPORT_POSTS = 50;
const IMPORT_PLATFORMS = ["facebook", "instagram"] as const;
export type ImportPlatform = (typeof IMPORT_PLATFORMS)[number];

export interface CampaignPostInput {
  platform?: unknown;
  caption?: unknown;
  hook?: unknown;
  hashtags?: unknown;
  linkUrl?: unknown;
  scheduledAt?: unknown;
}

export interface CampaignPost {
  platform: ImportPlatform;
  caption: string;
  hook: string | null;
  hashtags: string[];
  linkUrl: string | null;
  scheduledAt: string; // ISO
  status: "scheduled" | "draft";
  autoImage: boolean;
}

// Which imported posts get an image made automatically by /api/cron/social-images.
export type AutoImagesMode = "instagram" | "all" | "none";
const AUTO_IMAGES_MODES: AutoImagesMode[] = ["instagram", "all", "none"];

export function wantsAutoImage(platform: ImportPlatform, mode: AutoImagesMode): boolean {
  return mode === "all" || (mode === "instagram" && platform === "instagram");
}

export type ValidationResult =
  | { ok: true; brand: string; autoImages: AutoImagesMode; posts: CampaignPost[] }
  | { ok: false; errors: string[] };

const HASHTAG = /^[A-Za-z0-9_]{1,100}$/;
// Imported times must be at least this far ahead, so a post can't publish
// before the operator has looked at the calendar.
const MIN_LEAD_MS = 5 * 60 * 1000;

export function validateCampaign(input: unknown, now: number = Date.now()): ValidationResult {
  const errors: string[] = [];
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, errors: ['Expected an object like { "brand": "...", "posts": [...] }'] };
  }
  const { brand, posts, autoImages: rawMode } = input as { brand?: unknown; posts?: unknown; autoImages?: unknown };
  const autoImages: AutoImagesMode = rawMode === undefined ? "instagram" : (rawMode as AutoImagesMode);
  if (!AUTO_IMAGES_MODES.includes(autoImages)) errors.push('"autoImages" must be "instagram", "all" or "none"');

  if (typeof brand !== "string" || !brand.trim()) errors.push('"brand" (name or slug) is required');
  if (!Array.isArray(posts) || posts.length === 0) {
    errors.push('"posts" must be a non-empty list');
    return { ok: false, errors };
  }
  if (posts.length > MAX_IMPORT_POSTS) {
    errors.push(`At most ${MAX_IMPORT_POSTS} posts per import (got ${posts.length})`);
    return { ok: false, errors };
  }

  const out: CampaignPost[] = [];
  posts.forEach((raw: CampaignPostInput, i) => {
    const n = `Post ${i + 1}`;
    if (!raw || typeof raw !== "object") {
      errors.push(`${n}: not an object`);
      return;
    }
    const platform = raw.platform;
    if (typeof platform !== "string" || !(IMPORT_PLATFORMS as readonly string[]).includes(platform)) {
      errors.push(`${n}: platform must be "facebook" or "instagram"`);
      return;
    }
    const p = platform as ImportPlatform;

    const caption = typeof raw.caption === "string" ? raw.caption.trim() : "";
    if (!caption) errors.push(`${n}: caption is required`);
    else if (caption.length > 2200) errors.push(`${n}: caption is over 2,200 characters`);

    let hook: string | null = null;
    if (raw.hook !== undefined && raw.hook !== null) {
      if (typeof raw.hook !== "string" || raw.hook.length > 200) errors.push(`${n}: hook must be text up to 200 characters`);
      else hook = raw.hook.trim() || null;
    }

    let hashtags: string[] = [];
    if (raw.hashtags !== undefined) {
      if (!Array.isArray(raw.hashtags) || raw.hashtags.length > 30) {
        errors.push(`${n}: hashtags must be a list of up to 30`);
      } else {
        hashtags = raw.hashtags.map((h) => (typeof h === "string" ? h.trim().replace(/^#/, "") : ""));
        if (hashtags.some((h) => !HASHTAG.test(h))) errors.push(`${n}: hashtags may only use letters, numbers and _`);
      }
    }

    let linkUrl: string | null = null;
    if (raw.linkUrl !== undefined && raw.linkUrl !== null && raw.linkUrl !== "") {
      if (p === "instagram") {
        errors.push(`${n}: Instagram captions can't hold links — leave linkUrl out and say "link in bio"`);
      } else if (typeof raw.linkUrl !== "string" || raw.linkUrl.length > 500 || !isHttpsUrl(raw.linkUrl)) {
        errors.push(`${n}: linkUrl must be an https:// address up to 500 characters`);
      } else {
        linkUrl = raw.linkUrl;
      }
    }

    const at = typeof raw.scheduledAt === "string" ? Date.parse(raw.scheduledAt) : NaN;
    if (Number.isNaN(at)) errors.push(`${n}: scheduledAt must be a date and time, e.g. 2026-10-12T10:00:00-04:00`);
    else if (at < now + MIN_LEAD_MS) errors.push(`${n}: scheduledAt is in the past`);

    out.push({
      platform: p,
      caption,
      hook,
      hashtags,
      linkUrl,
      scheduledAt: Number.isNaN(at) ? "" : new Date(at).toISOString(),
      status: p === "facebook" ? "scheduled" : "draft",
      autoImage: wantsAutoImage(p, autoImages),
    });
  });

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, brand: (brand as string).trim(), autoImages, posts: out };
}

function isHttpsUrl(s: string): boolean {
  try {
    return new URL(s).protocol === "https:";
  } catch {
    return false;
  }
}

// Matches the brand by slug or name, ignoring case.
export function findBrand<T extends { id: string; name: string; slug: string }>(brands: T[], key: string): T | null {
  const k = key.trim().toLowerCase();
  return brands.find((b) => b.slug.toLowerCase() === k) ?? brands.find((b) => b.name.trim().toLowerCase() === k) ?? null;
}
