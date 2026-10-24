import type { createServiceClient } from "@/lib/supabase";
import { evaluateApproval, type RiskLevel } from "@/lib/social/riskEvaluator";
import { brandMediaPolicy } from "@/lib/social/brandMediaPolicy";
import { connectedPlatforms } from "@/lib/social/connectedPlatforms";
import { raiseAutonomyFlag } from "@/lib/social/autonomyFlags";
import type { SocialBrand } from "@/lib/database.types";

// Renaissance (revalor-admin's marketing brain) schedules a post here, under a
// time-limited permission the owner approved there. This is the one gate, so
// Renaissance never re-implements Social's rules: a paused brand or an
// unconnected platform blocks; evaluateApproval runs with the brand's banned
// words and audience, always as semi-autonomous (only low risk goes out on its
// own, kids brands keep their safety net; a brand set to manual sends every
// post to review); the link is checked too and must point at the brand's own
// site or revalorllc.com, else review; and the post must be at least
// MIN_LEAD_HOURS away so the owner can hold it. Facebook and Instagram only;
// Instagram needs auto_image (the image cron makes the image, then schedules
// it — without one it never publishes). Posts are saved generated_by
// "autonomous", so pausing the brand also holds them (social-publish cron).
// A rejection or a review raises an autonomy flag (alert, no brand pause), as
// the autopilot does. The same post is only
// saved once a day (same brand, platform and caption), so a retry can't double it. The brand's autopilot switch
// (autonomy_enabled) isn't required: that's whether Social writes its own
// posts; Renaissance posts under the owner's separate permission.

type Service = ReturnType<typeof createServiceClient>;

export const MIN_LEAD_HOURS = 12;
export const MAX_AHEAD_DAYS = 30;
export const SCHEDULE_PLATFORMS = ["facebook", "instagram"] as const;
const CAPTION_MAX: Record<(typeof SCHEDULE_PLATFORMS)[number], number> = { facebook: 5000, instagram: 2200 };
const HOUR = 3_600_000;

export type ScheduleRequest = {
  brandId: string;
  platform: (typeof SCHEDULE_PLATFORMS)[number];
  hook: string | null;
  caption: string;
  hashtags: string[];
  linkUrl: string | null;
  scheduledAt: string;
  riskLevel: RiskLevel;
  autoImage: boolean;
};

export type ScheduleOutcome =
  | { status: "scheduled"; id: string; scheduledAt: string }
  | { status: "review"; id: string; reason: string }
  | { status: "rejected"; reason: string }
  | { status: "blocked"; reason: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Validates the request body. Pure. */
export function parseScheduleRequest(b: unknown, now: Date): { ok: true; req: ScheduleRequest } | { ok: false; error: string } {
  if (!b || typeof b !== "object") return { ok: false, error: "Invalid body" };
  const o = b as Record<string, unknown>;
  if (typeof o.brandId !== "string" || !UUID.test(o.brandId)) return { ok: false, error: "brandId must be a uuid" };
  if (!SCHEDULE_PLATFORMS.includes(o.platform as ScheduleRequest["platform"])) return { ok: false, error: "platform must be facebook or instagram" };
  const platform = o.platform as ScheduleRequest["platform"];
  const caption = typeof o.caption === "string" ? o.caption.trim() : "";
  if (!caption || caption.length > CAPTION_MAX[platform]) return { ok: false, error: `caption must be 1–${CAPTION_MAX[platform]} characters` };
  const hook = typeof o.hook === "string" && o.hook.trim() ? o.hook.trim().slice(0, 300) : null;
  const hashtags = Array.isArray(o.hashtags) ? o.hashtags.filter((h): h is string => typeof h === "string" && /^[\p{L}\p{N}_]{1,60}$/u.test(h)).slice(0, 30) : [];
  const linkUrl = typeof o.linkUrl === "string" && /^https:\/\/[^\s]+$/.test(o.linkUrl) && o.linkUrl.length <= 2000 ? o.linkUrl : null;
  const at = typeof o.scheduledAt === "string" ? new Date(o.scheduledAt) : null;
  if (!at || Number.isNaN(at.getTime())) return { ok: false, error: "scheduledAt must be an ISO date" };
  if (at.getTime() < now.getTime() + MIN_LEAD_HOURS * HOUR) return { ok: false, error: `scheduledAt must be at least ${MIN_LEAD_HOURS} hours away` };
  if (at.getTime() > now.getTime() + MAX_AHEAD_DAYS * 24 * HOUR) return { ok: false, error: `scheduledAt must be within ${MAX_AHEAD_DAYS} days` };
  // Anything unrated counts as medium, which goes to review.
  const riskLevel: RiskLevel = o.riskLevel === "low" || o.riskLevel === "high" ? o.riskLevel : "medium";
  return { ok: true, req: { brandId: o.brandId, platform, hook, caption, hashtags, linkUrl, scheduledAt: at.toISOString(), riskLevel, autoImage: o.autoImage === true } };
}

/** Whether a link may go out without review: the brand's own site's host, or revalorllc.com and its subdomains. Pure. */
export function linkAllowed(linkUrl: string, brandWebsite: string | null): boolean {
  try {
    const host = new URL(linkUrl).hostname.toLowerCase();
    if (host === "revalorllc.com" || host.endsWith(".revalorllc.com")) return true;
    return !!brandWebsite && new URL(brandWebsite).hostname.toLowerCase() === host;
  } catch {
    return false;
  }
}

/** What happens to the post, given the brand's state. Pure. */
export function decideSchedule(
  req: ScheduleRequest,
  brand: Pick<SocialBrand, "name" | "banned_words" | "autonomy_paused_at" | "autonomy_mode" | "website_url">,
  connected: string[],
): { kind: "blocked" | "rejected"; reason: string } | { kind: "review"; reason: string } | { kind: "scheduled"; status: "scheduled" | "approved" } {
  if (brand.autonomy_paused_at) return { kind: "blocked", reason: `${brand.name}'s automatic posting is paused in Social.` };
  if (!connected.includes(req.platform)) return { kind: "blocked", reason: `${brand.name} has no connected ${req.platform} account.` };
  const copy = [req.hook, req.caption, req.hashtags.map((h) => `#${h}`).join(" "), req.linkUrl].filter(Boolean).join("\n");
  // The stricter of the brand's own mode and semi-autonomous.
  const mode = brand.autonomy_mode === "manual" ? "manual" : "semi_autonomous";
  const verdict = evaluateApproval({ copy, riskLevel: req.riskLevel, bannedWords: brand.banned_words ?? [], autonomyMode: mode, audience: brandMediaPolicy(brand.name).audience });
  if (verdict.status === "reject") return { kind: "rejected", reason: verdict.reason ?? "Rejected by Social's checks" };
  if (verdict.status === "review") return { kind: "review", reason: verdict.reason ?? "Held for review" };
  if (req.linkUrl && !linkAllowed(req.linkUrl, brand.website_url)) return { kind: "review", reason: `The link (${new URL(req.linkUrl).hostname}) isn't ${brand.name}'s site or revalorllc.com.` };
  if (req.platform === "instagram") {
    if (!req.autoImage) return { kind: "review", reason: "Instagram needs an image; this permission doesn't allow automatic images." };
    // Waits as "approved" until the image cron has made its image, then becomes scheduled.
    return { kind: "scheduled", status: "approved" };
  }
  return { kind: "scheduled", status: "scheduled" };
}

export async function scheduleForRenaissance(service: Service, req: ScheduleRequest): Promise<ScheduleOutcome> {
  const { data: brand, error } = await service.from("social_brands").select("*").eq("id", req.brandId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!brand) return { status: "blocked", reason: "That Social brand doesn't exist." };
  const decision = decideSchedule(req, brand, await connectedPlatforms(service, brand));
  if (decision.kind === "rejected") await raiseAutonomyFlag(service, { brandId: brand.id, brandName: brand.name, kind: "banned_word", detail: `Renaissance post rejected before scheduling — ${decision.reason}`, pauseBrand: false });
  if (decision.kind === "blocked" || decision.kind === "rejected") return { status: decision.kind, reason: decision.reason };

  const scheduled = decision.kind === "scheduled";
  // A retry of the same post (e.g. after a timeout) returns the row already saved.
  const { data: same } = await service.from("social_content").select("id, status").eq("brand_id", brand.id).eq("platform", req.platform).eq("caption", req.caption).eq("generated_by", "autonomous").gte("created_at", new Date(Date.now() - 24 * HOUR).toISOString()).limit(1).maybeSingle();
  if (same) return same.status === "draft" ? { status: "review", id: same.id, reason: "Already saved for review." } : { status: "scheduled", id: same.id, scheduledAt: req.scheduledAt };

  const { data: row, error: insErr } = await service
    .from("social_content")
    .insert({
      brand_id: brand.id,
      platform: req.platform,
      hook: req.hook,
      caption: req.caption,
      hashtags: req.hashtags,
      link_url: req.linkUrl,
      risk_level: req.riskLevel,
      generated_by: "autonomous",
      status: scheduled ? decision.status : "draft",
      scheduled_at: scheduled ? req.scheduledAt : null,
      auto_image: scheduled && req.platform === "instagram",
    })
    .select("id")
    .single();
  if (insErr || !row) throw new Error(insErr?.message ?? "Couldn't save the post");
  if (!scheduled) await raiseAutonomyFlag(service, { brandId: brand.id, brandName: brand.name, contentId: row.id, kind: "high_risk", detail: `Renaissance post held for review — ${decision.reason}`, pauseBrand: false });
  return scheduled ? { status: "scheduled", id: row.id, scheduledAt: req.scheduledAt } : { status: "review", id: row.id, reason: decision.reason };
}
