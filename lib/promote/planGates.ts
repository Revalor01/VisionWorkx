import type { PromoteCampaignPlatform, PromotePlan } from "@/lib/database.types";

export interface PlanLimits {
  creativesPerMonth: number; // -1 = unlimited
  platforms: PromoteCampaignPlatform[]; // platforms this plan may build campaigns for
  analytics: boolean;
}

// Meta/Google are listed here as the eventual platform access each paid tier
// unlocks, but publishing itself is Phase 2 (pending API approval) — see
// app/api/promote/campaigns/[id]/publish/route.ts.
export const PLAN_LIMITS: Record<"free" | PromotePlan, PlanLimits> = {
  free: { creativesPerMonth: 3, platforms: [], analytics: false },
  starter: { creativesPerMonth: 10, platforms: ["meta"], analytics: true },
  growth: { creativesPerMonth: -1, platforms: ["meta", "google", "both"], analytics: true },
  pro: { creativesPerMonth: -1, platforms: ["meta", "google", "both"], analytics: true },
};

export function limitsForPlan(plan: PromotePlan | null): PlanLimits {
  return PLAN_LIMITS[plan ?? "free"];
}

export function planAllowsPlatform(plan: PromotePlan | null, platform: PromoteCampaignPlatform): boolean {
  return limitsForPlan(plan).platforms.includes(platform);
}
