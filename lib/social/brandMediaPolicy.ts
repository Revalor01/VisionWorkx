// Per-brand media policy. Some brands must never carry the wrong framing in
// generated video:
//   - Revalor Kids (Chorebit, FeelFlow, MindBit) is a kids/family brand —
//     image-first, ~1 video/week, and any video must be kid-appropriate and
//     only about its own products, never business/VisionWorkx/adult imagery.
//   - Revalor Wellness (Sanctum) is a mental-health / mindfulness APP — its
//     video must read as a calm digital app, NEVER pills, supplements, or any
//     drug/pharmaceutical imagery (video models ignore "never show X", so the
//     prompt builder frames it positively; see videoGenerator.buildContentVideoPrompt).
// Keyed by the exact social_brands.name (same convention as productKnowledge's
// BRAND_PRODUCTS). Pure, no I/O — no migration needed.

export type BrandAudience = "kids" | "business";
export type VideoStyle = "kids" | "wellness" | "software";

export interface BrandMediaPolicy {
  audience: BrandAudience;
  /** Which creative template the video generator uses for this brand. */
  videoStyle: VideoStyle;
  /** Prefer images over video for this brand. */
  imageFirst: boolean;
  /** Ceiling on auto-generated videos per 7-day window. */
  maxVideosPerWeek: number;
  /**
   * Optional weekly cadence for Social's own daily autopilot (cron social-generate):
   * at most `postsPerWeek` posts per platform in any 7 days, only on `platforms`,
   * each carrying an automatic image (never video) — the post waits as "approved"
   * until its image exists, then becomes scheduled.
   */
  weeklyAutopilot?: { postsPerWeek: number; media: "image"; platforms: ("facebook" | "instagram")[] };
}

const POLICIES: Record<string, BrandMediaPolicy> = {
  "Revalor Kids": { audience: "kids", videoStyle: "kids", imageFirst: true, maxVideosPerWeek: 1, weeklyAutopilot: { postsPerWeek: 1, media: "image", platforms: ["facebook", "instagram"] } },
  "Revalor Wellness": { audience: "business", videoStyle: "wellness", imageFirst: false, maxVideosPerWeek: Number.POSITIVE_INFINITY },
};

const DEFAULT_POLICY: BrandMediaPolicy = {
  audience: "business",
  videoStyle: "software",
  imageFirst: false,
  maxVideosPerWeek: Number.POSITIVE_INFINITY,
};

export function brandMediaPolicy(brandName: string): BrandMediaPolicy {
  return POLICIES[brandName] ?? DEFAULT_POLICY;
}

/**
 * For a brand on a weekly cadence: which connected platforms still have room this
 * week, given how many autonomous posts each got in the last 7 days. Brands without
 * a weekly cadence get every connected platform back unchanged. Pure.
 */
export function weeklyPlatforms<P extends string>(policy: BrandMediaPolicy, connected: P[], postsLast7Days: Partial<Record<string, number>>): P[] {
  const w = policy.weeklyAutopilot;
  if (!w) return connected;
  return connected.filter((p) => (w.platforms as string[]).includes(p) && (postsLast7Days[p] ?? 0) < w.postsPerWeek);
}

export function isKidsBrand(brandName: string): boolean {
  return brandMediaPolicy(brandName).audience === "kids";
}

/**
 * How many hero videos a batch over `days` may auto-generate for this brand:
 * unlimited for business brands, ~maxVideosPerWeek per 7 days for capped ones.
 */
export function maxVideosForHorizon(brandName: string, days: number): number {
  const { maxVideosPerWeek } = brandMediaPolicy(brandName);
  if (!Number.isFinite(maxVideosPerWeek)) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.ceil((Math.max(1, days) / 7) * maxVideosPerWeek));
}
