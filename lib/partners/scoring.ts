import type {
  PartnerBudgetRange,
  PartnerIndustry,
  PartnerReferralNetworkSize,
  PartnerScoreSignal,
  PartnerSocialReachRange,
  PartnerTier,
} from "@/lib/database.types";

// ---------------------------------------------------------------
// Option lists — the single source of truth for every dropdown /
// checkbox on the public application form. Imported by both the
// client form (to render choices) and the API route (to validate
// submitted values against this exact closed set), so client and
// server can never drift apart.
// ---------------------------------------------------------------

export const INDUSTRY_OPTIONS: { value: PartnerIndustry; label: string }[] = [
  { value: "health_wellness", label: "Health & Wellness (salon, spa, gym)" },
  { value: "home_services_trades", label: "Home Services / Trades (electrician, plumber, HVAC)" },
  { value: "food_beverage", label: "Food & Beverage" },
  { value: "fitness", label: "Fitness" },
  { value: "professional_services", label: "Professional Services" },
  { value: "automotive", label: "Automotive" },
  { value: "retail", label: "Retail" },
  { value: "other", label: "Other" },
];

export const BUDGET_RANGE_OPTIONS: { value: PartnerBudgetRange; label: string }[] = [
  { value: "under_500", label: "Under $500" },
  { value: "500_1500", label: "$500 – $1,500" },
  { value: "1500_5000", label: "$1,500 – $5,000" },
  { value: "5000_plus", label: "$5,000+" },
];

export const SOCIAL_REACH_OPTIONS: { value: PartnerSocialReachRange; label: string }[] = [
  { value: "under_500", label: "Under 500 followers" },
  { value: "500_2500", label: "500 – 2,500 followers" },
  { value: "2500_10000", label: "2,500 – 10,000 followers" },
  { value: "10000_50000", label: "10,000 – 50,000 followers" },
  { value: "50000_plus", label: "50,000+ followers" },
];

export const REFERRAL_NETWORK_OPTIONS: { value: PartnerReferralNetworkSize; label: string }[] = [
  { value: "0_5", label: "0 – 5 businesses" },
  { value: "6_15", label: "6 – 15 businesses" },
  { value: "16_40", label: "16 – 40 businesses" },
  { value: "41_plus", label: "41+ businesses" },
];

export const SERVICES_OFFERED_OPTIONS: { value: string; label: string }[] = [
  { value: "booking_appointments", label: "Booking / Appointments" },
  { value: "retail_products", label: "Retail Products" },
  { value: "custom_orders", label: "Custom Orders" },
  { value: "multi_location", label: "Multi-Location" },
  { value: "subscription_membership", label: "Subscription / Membership" },
  { value: "consulting_custom_projects", label: "Consulting / Custom Projects" },
  { value: "other", label: "Other" },
];

// ---------------------------------------------------------------
// Scoring — deterministic, 0-100 across 5 weighted dimensions.
// Every fired signal is recorded in the returned breakdown so a
// score is always auditable, not just a number (same principle as
// lib/leadScoring.ts's signalBreakdown).
//
// Tier thresholds and discounts are placeholders pending real
// pricing sign-off — kept as named constants so adjusting them is a
// one-line change, not a migration.
// ---------------------------------------------------------------

const TIER_THRESHOLDS: { tier: PartnerTier; minScore: number }[] = [
  { tier: "tier_1", minScore: 70 },
  { tier: "tier_2", minScore: 40 },
  { tier: "tier_3", minScore: 0 },
];

const TIER_DISCOUNTS: Record<PartnerTier, number> = {
  tier_1: 25,
  tier_2: 15,
  tier_3: 5,
};

const INDUSTRY_FIT_POINTS: Record<PartnerIndustry, number> = {
  health_wellness: 20,
  home_services_trades: 20,
  fitness: 18,
  food_beverage: 14,
  automotive: 14,
  professional_services: 14,
  retail: 10,
  other: 6,
};

const PROMOTIONAL_REACH_BASE_POINTS: Record<PartnerSocialReachRange, number> = {
  under_500: 3,
  "500_2500": 8,
  "2500_10000": 14,
  "10000_50000": 19,
  "50000_plus": 22,
};
const PROMOTIONAL_REACH_ONLINE_PRESENCE_BONUS = 3;
const PROMOTIONAL_REACH_MAX = 25;

const BUDGET_ALIGNMENT_POINTS: Record<PartnerBudgetRange, number> = {
  under_500: 4,
  "500_1500": 12,
  "1500_5000": 18,
  "5000_plus": 20,
};

const PROJECT_COMPLEXITY_MAX = 15;
const PROJECT_COMPLEXITY_STEP = 3;
const PROJECT_COMPLEXITY_MIN = 3;

const REFERRAL_POTENTIAL_POINTS: Record<PartnerReferralNetworkSize, number> = {
  "0_5": 4,
  "6_15": 10,
  "16_40": 16,
  "41_plus": 20,
};

export interface PartnerApplicationScoringInput {
  industry: PartnerIndustry;
  socialReachRange: PartnerSocialReachRange;
  onlinePresenceUrl: string | null | undefined;
  budgetRange: PartnerBudgetRange;
  servicesOffered: string[];
  referralNetworkSize: PartnerReferralNetworkSize;
}

export interface PartnerApplicationScore {
  scoreBreakdown: PartnerScoreSignal[];
  totalScore: number;
  tier: PartnerTier;
  discountPercentage: number;
}

export function scorePartnerApplication(input: PartnerApplicationScoringInput): PartnerApplicationScore {
  const breakdown: PartnerScoreSignal[] = [];

  const industryFitPoints = INDUSTRY_FIT_POINTS[input.industry];
  breakdown.push({ dimension: "industry_fit", label: `Industry: ${input.industry}`, points: industryFitPoints });

  const hasOnlinePresence = Boolean(input.onlinePresenceUrl && input.onlinePresenceUrl.trim().toLowerCase() !== "none");
  const promotionalReachPoints = Math.min(
    PROMOTIONAL_REACH_BASE_POINTS[input.socialReachRange] + (hasOnlinePresence ? PROMOTIONAL_REACH_ONLINE_PRESENCE_BONUS : 0),
    PROMOTIONAL_REACH_MAX,
  );
  breakdown.push({
    dimension: "promotional_reach",
    label: `Social reach: ${input.socialReachRange}${hasOnlinePresence ? " + online presence" : ""}`,
    points: promotionalReachPoints,
  });

  const budgetAlignmentPoints = BUDGET_ALIGNMENT_POINTS[input.budgetRange];
  breakdown.push({ dimension: "budget_alignment", label: `Budget: ${input.budgetRange}`, points: budgetAlignmentPoints });

  const serviceCount = Math.max(input.servicesOffered.length, 1);
  const projectComplexityPoints = Math.max(
    PROJECT_COMPLEXITY_MAX - (serviceCount - 1) * PROJECT_COMPLEXITY_STEP,
    PROJECT_COMPLEXITY_MIN,
  );
  breakdown.push({
    dimension: "project_complexity",
    label: `${serviceCount} service line${serviceCount === 1 ? "" : "s"} requested`,
    points: projectComplexityPoints,
  });

  const referralPotentialPoints = REFERRAL_POTENTIAL_POINTS[input.referralNetworkSize];
  breakdown.push({
    dimension: "referral_potential",
    label: `Referral network: ${input.referralNetworkSize}`,
    points: referralPotentialPoints,
  });

  const totalScore = breakdown.reduce((sum, signal) => sum + signal.points, 0);
  const tier = TIER_THRESHOLDS.find((t) => totalScore >= t.minScore)?.tier ?? "tier_3";
  const discountPercentage = TIER_DISCOUNTS[tier];

  return { scoreBreakdown: breakdown, totalScore, tier, discountPercentage };
}

export const TIER_LABELS: Record<PartnerTier, string> = {
  tier_1: "Tier 1 — High Value Partner",
  tier_2: "Tier 2 — Standard Partner",
  tier_3: "Tier 3 — Entry Partner",
};
