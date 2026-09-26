import type Stripe from "stripe";

// Terms §10 / Privacy §6: after a Modules subscription ends, the business has
// 30 days to export, then the workspace, its submissions and files are deleted.
export const RETENTION_DAYS = 30;

const ENDED_STATUSES: Stripe.Subscription.Status[] = ["canceled", "incomplete_expired"];

export type RetentionDecision =
  | { action: "delete"; endedAt: Date }
  | { action: "wait"; endedAt: Date }
  | { action: "skip"; reason: string };

/**
 * Decides from Stripe's own record — never from our DB alone — so a missed or
 * wrong webhook can't delete a paying customer's data.
 */
export function retentionDecision(sub: Pick<Stripe.Subscription, "status" | "ended_at"> | null, now = new Date()): RetentionDecision {
  if (!sub) return { action: "skip", reason: "subscription not found in Stripe" };
  if (!ENDED_STATUSES.includes(sub.status)) return { action: "skip", reason: `Stripe says subscription is ${sub.status}` };
  if (!sub.ended_at) return { action: "skip", reason: "subscription has no ended_at" };
  const endedAt = new Date(sub.ended_at * 1000);
  const cutoff = new Date(now.getTime() - RETENTION_DAYS * 864e5);
  return endedAt <= cutoff ? { action: "delete", endedAt } : { action: "wait", endedAt };
}
