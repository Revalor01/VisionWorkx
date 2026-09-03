import type { Plan } from "@/lib/database.types";

// Plain-English change requests allowed per user per calendar month, by
// plan. A change request is one Claude edit pass over the full app source
// (~$0.30 of tokens) plus a preview + promote deploy, so the cost scales
// with an engaged customer — the quota keeps the tail bounded rather than
// rationing normal use. "Pro" is deliberately a high number, not Infinity.
export const CHANGE_REQUEST_LIMITS: Record<Plan, number> = {
  free: 3, // trial
  starter: 5,
  growth: 20,
  pro: 150,
};

/** ISO timestamp for 00:00 UTC on the first of the current month. */
export function monthStartISO(now: Date = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

export interface ChangeQuota {
  used: number;
  limit: number;
}

export function quotaExhausted(quota: ChangeQuota): boolean {
  return quota.used >= quota.limit;
}
