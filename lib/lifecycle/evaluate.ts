import { createServiceClient } from "@/lib/supabase";
import { fetchProductUsersWithActivity } from "@/lib/marketing/audience";
import type { LifecycleTriggerId } from "./triggers";
import type { MarketingProduct } from "@/lib/database.types";

export const DAY_MS = 24 * 60 * 60 * 1000;

export interface QualifyingUser {
  id: string;
  email: string;
}

export interface ActivityRecord {
  createdAt: string;
  lastSignInAt: string | null;
}

function lastActivityMs(u: ActivityRecord): number {
  return new Date(u.lastSignInAt ?? u.createdAt).getTime();
}

export function isWelcomeDue(u: ActivityRecord, now: number): boolean {
  return new Date(u.createdAt).getTime() >= now - 2 * DAY_MS;
}

// "Hasn't hit a key action" has no product-agnostic definition without
// per-product event data (see triggers.ts's comment) — the closest real
// proxy every product exposes is "never signed back in after signup."
export function isActivationNudgeDue(u: ActivityRecord, now: number): boolean {
  const createdAtMs = new Date(u.createdAt).getTime();
  const windowStart = now - 10 * DAY_MS;
  const windowEnd = now - 3 * DAY_MS;
  if (createdAtMs < windowStart || createdAtMs > windowEnd) return false;
  return !u.lastSignInAt || new Date(u.lastSignInAt).getTime() <= createdAtMs + 60_000;
}

// A rolling 7-day capture window (not "exactly N days") so the hourly cron
// doesn't need to hit the precise instant a user crosses the threshold —
// lifecycle_fires' dedupe means being in the window on more than one run
// still only sends once.
export function isWinBackDue(u: ActivityRecord, days: number, now: number): boolean {
  const t = lastActivityMs(u);
  const windowStart = now - (days + 7) * DAY_MS;
  const windowEnd = now - days * DAY_MS;
  return t > windowStart && t <= windowEnd;
}

async function findWelcome(product: MarketingProduct): Promise<QualifyingUser[]> {
  const users = await fetchProductUsersWithActivity(product);
  const now = Date.now();
  return users.filter((u) => isWelcomeDue(u, now));
}

async function findActivationNudge(product: MarketingProduct): Promise<QualifyingUser[]> {
  const users = await fetchProductUsersWithActivity(product);
  const now = Date.now();
  return users.filter((u) => isActivationNudgeDue(u, now));
}

async function findWinBack(product: MarketingProduct, days: number): Promise<QualifyingUser[]> {
  const users = await fetchProductUsersWithActivity(product);
  const now = Date.now();
  return users.filter((u) => isWinBackDue(u, days, now));
}

// VisionWorkx-only — see triggers.ts for why this is the one milestone
// with a real, verifiable per-product signal today.
async function findFirstDeployMilestone(): Promise<QualifyingUser[]> {
  const service = createServiceClient();
  const { data: apps, error } = await service.from("apps").select("user_id").eq("status", "deployed");
  if (error) throw error;

  const deployedUserIds = new Set((apps ?? []).map((a) => a.user_id));
  if (deployedUserIds.size === 0) return [];

  const users = await fetchProductUsersWithActivity("visionworkx");
  return users.filter((u) => deployedUserIds.has(u.id)).map((u) => ({ id: u.id, email: u.email }));
}

export async function findQualifyingUsers(triggerId: LifecycleTriggerId, product: MarketingProduct): Promise<QualifyingUser[]> {
  switch (triggerId) {
    case "welcome":
      return findWelcome(product);
    case "activation_nudge":
      return findActivationNudge(product);
    case "win_back_30":
      return findWinBack(product, 30);
    case "win_back_60":
      return findWinBack(product, 60);
    case "win_back_90":
      return findWinBack(product, 90);
    case "vw_first_deploy":
      return findFirstDeployMilestone();
  }
}
