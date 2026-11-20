// Revalor's LinkedIn rotation (see the linkedin-strategy skill): one post a
// week on a 4-week cycle. Weeks 1 and 3 are pure-value business/ops
// insights, week 2 a product story, week 4 a promotion (max one a month).
// Campaigns must not take the value weeks. Pure, so it runs anywhere.

export const LINKEDIN_POST_TYPES = ["insight", "story", "promo"] as const;
export type LinkedInPostType = (typeof LINKEDIN_POST_TYPES)[number];

export const POST_TYPE_LABEL: Record<LinkedInPostType, string> = {
  insight: "Business / ops insight (pure value)",
  story: "Product story",
  promo: "Promotion (one offer, one CTA)",
};

export function isPostType(v: unknown): v is LinkedInPostType {
  return typeof v === "string" && (LINKEDIN_POST_TYPES as readonly string[]).includes(v);
}

// Week 1 of the cycle is the week of Mon 23 Nov 2026 (local time).
const ANCHOR = new Date(2026, 10, 23);
const WEEK_MS = 7 * 864e5;

/** 1-4: where a date falls in the rotation. */
export function rotationWeek(d: Date): 1 | 2 | 3 | 4 {
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const monday = new Date(day);
  monday.setDate(day.getDate() - ((day.getDay() + 6) % 7));
  const weeks = Math.round((monday.getTime() - ANCHOR.getTime()) / WEEK_MS);
  return ((((weeks % 4) + 4) % 4) + 1) as 1 | 2 | 3 | 4;
}

/** The post type the rotation calls for on that date. */
export function rotationType(d: Date): LinkedInPostType {
  const w = rotationWeek(d);
  return w === 2 ? "story" : w === 4 ? "promo" : "insight";
}
