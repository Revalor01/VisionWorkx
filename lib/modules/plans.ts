// VisionWorkx plans (no free tier; 14-day Starter trial via Stripe).
// Single source of truth for caps — enforced in the submit/upload/draft/module
// routes. Email caps are mirrored in revalor-automation/lib/vw/limits.mjs.

export const PLANS = ["starter", "growth", "pro"] as const;
export type ModulePlan = (typeof PLANS)[number];

export interface PlanLimits {
  modules: number;
  submissionsPerMonth: number; // included; soft limit up to SUBMISSION_HARD_FACTOR
  emailsPerMonth: number; // automation sends (confirmation + alert = 2 per submission)
  storageBytes: number;
  aiDraftsPerMonth: number;
  chatsPerMonth: number; // AI receptionist chat conversations; soft limit up to SUBMISSION_HARD_FACTOR
  voiceMinutesPerMonth: number; // AI receptionist phone minutes; at 100% calls are short message-only, refused past 120%
}

const GB = 1024 ** 3;
export const PLAN_LIMITS: Record<ModulePlan, PlanLimits> = {
  starter: { modules: 2, submissionsPerMonth: 500, emailsPerMonth: 1_000, storageBytes: 1 * GB, aiDraftsPerMonth: 50, chatsPerMonth: 300, voiceMinutesPerMonth: 100 },
  growth: { modules: 6, submissionsPerMonth: 2_500, emailsPerMonth: 5_000, storageBytes: 2 * GB, aiDraftsPerMonth: 150, chatsPerMonth: 1_500, voiceMinutesPerMonth: 300 },
  pro: { modules: 20, submissionsPerMonth: 10_000, emailsPerMonth: 20_000, storageBytes: 10 * GB, aiDraftsPerMonth: 500, chatsPerMonth: 5_000, voiceMinutesPerMonth: 1_000 },
};

export const PLAN_PRICE: Record<ModulePlan, { monthly: number; annual: number; label: string }> = {
  starter: { monthly: 59, annual: 566, label: "Starter" },
  growth: { monthly: 129, annual: 1_238, label: "Growth" },
  pro: { monthly: 299, annual: 2_870, label: "Pro" },
};

export const TRIAL_DAYS = 14;
/** Submissions keep saving up to this multiple of the included amount; beyond it the form pauses. */
export const SUBMISSION_HARD_FACTOR = 1.5;

export function limitsFor(plan: string | null | undefined): PlanLimits {
  return PLAN_LIMITS[(PLANS as readonly string[]).includes(plan ?? "") ? (plan as ModulePlan) : "starter"];
}

export type BillingStatus = "none" | "trialing" | "active" | "past_due" | "canceled" | "comped";

/** Can this workspace's forms run? past_due keeps working while Stripe retries the card. */
export function billingAllowsService(status: string | null | undefined): boolean {
  return status === "trialing" || status === "active" || status === "past_due" || status === "comped";
}

export type SubmissionGate =
  | { allow: true; alert: null | "submissions_80" | "submissions_100" }
  | { allow: false; alert: "submissions_150" };

/**
 * Soft limit: `countBefore` = this month's submissions before this one.
 * Warn at 80% and 100% of included; keep accepting up to 150%; then pause.
 */
export function gateSubmission(countBefore: number, included: number): SubmissionGate {
  const hard = Math.floor(included * SUBMISSION_HARD_FACTOR);
  if (countBefore >= hard) return { allow: false, alert: "submissions_150" };
  const after = countBefore + 1;
  if (after === included) return { allow: true, alert: "submissions_100" };
  if (after === Math.ceil(included * 0.8)) return { allow: true, alert: "submissions_80" };
  return { allow: true, alert: null };
}

export type ChatGate =
  | { allow: true; alert: null | "chats_80" | "chats_100" }
  | { allow: false; alert: "chats_150" };

/** Same soft limit as submissions, for new receptionist chat conversations (`countBefore` = this month's chats before this one). */
export function gateChat(countBefore: number, included: number): ChatGate {
  const g = gateSubmission(countBefore, included);
  if (!g.allow) return { allow: false, alert: "chats_150" };
  return { allow: true, alert: g.alert === "submissions_80" ? "chats_80" : g.alert === "submissions_100" ? "chats_100" : null };
}

/**
 * Voice cap (every minute costs real money): true while the workspace is
 * under its included minutes. `secondsUsed` = this month so far. Over it,
 * calls are limited to taking a short message (see lib/receptionist/voice).
 */
export function voiceAllowed(secondsUsed: number, includedMinutes: number): boolean {
  return includedMinutes > 0 && secondsUsed < includedMinutes * 60;
}

/** Which voice alert (if any) crossing from `before` to `after` seconds should send. */
export function voiceAlert(beforeSeconds: number, afterSeconds: number, includedMinutes: number): null | "voice_80" | "voice_100" {
  const cap = includedMinutes * 60;
  if (cap <= 0) return null;
  if (beforeSeconds < cap && afterSeconds >= cap) return "voice_100";
  if (beforeSeconds < cap * 0.8 && afterSeconds >= cap * 0.8) return "voice_80";
  return null;
}

export function currentPeriod(d = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthStartIso(d = new Date()): string {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
}
