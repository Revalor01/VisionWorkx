import type { Plan } from "./database.types";

// Automation email sends allowed per user per calendar month, by plan.
// MUST match revalor-automation/lib/planLimits.mjs — these are two
// separate deployables with no shared package, kept in sync by hand.
export const AUTOMATION_SEND_LIMITS: Record<Plan, number> = {
  free: 25,
  starter: 100,
  growth: 500,
  pro: 2000,
};

export function currentAutomationPeriod(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}
