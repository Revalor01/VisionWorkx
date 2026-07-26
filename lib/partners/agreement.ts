import type { AgreementTerms, PartnerApplication, PartnerTier } from "@/lib/database.types";
import { TIER_LABELS } from "@/lib/partners/scoring";

// Static per-tier boilerplate — the descriptive content behind the
// original spec's "required promotional actions / referral
// expectations / scope limitations / timeline / payment structure."
// The operational tooling behind these (referral code tracking, a
// scope-template builder, live Stripe checkout, badge-display
// enforcement) is Phase 3; Phase 2 just documents the terms.

const PAYMENT_STRUCTURE =
  "50% deposit due at kickoff, 50% due at launch. A secure payment link will be sent separately.";

const TIER_TERMS: Record<
  PartnerTier,
  Pick<AgreementTerms, "requiredPromotionalActions" | "referralExpectations" | "scopeNote" | "timeline" | "paymentStructure">
> = {
  tier_1: {
    requiredPromotionalActions: [
      'Display a "Built by VisionWorkx" badge on your website',
      "Tag @VisionWorkx in at least 2 social media posts per quarter",
      "Provide one written or video testimonial after launch",
    ],
    referralExpectations: "Refer at least 3 qualified businesses per quarter to maintain Tier 1 status.",
    scopeNote: "Includes up to a 7-page site plus one add-on module (booking, gallery, forms, or SEO).",
    timeline: "Typical build timeline: 2–4 weeks from kickoff to launch, depending on scope.",
    paymentStructure: PAYMENT_STRUCTURE,
  },
  tier_2: {
    requiredPromotionalActions: [
      'Display a "Built by VisionWorkx" badge on your website',
      "Tag @VisionWorkx in at least 1 social media post per quarter",
      "Provide one written testimonial after launch",
    ],
    referralExpectations: "Refer at least 1 qualified business per quarter to maintain Tier 2 status.",
    scopeNote: "Includes up to a 5-page site.",
    timeline: "Typical build timeline: 2–4 weeks from kickoff to launch, depending on scope.",
    paymentStructure: PAYMENT_STRUCTURE,
  },
  tier_3: {
    requiredPromotionalActions: [
      'Display a "Built by VisionWorkx" badge on your website',
      "Provide one written testimonial after launch",
    ],
    referralExpectations: "Referrals are welcomed but not required at Tier 3.",
    scopeNote: "Includes up to a 3-page site.",
    timeline: "Typical build timeline: 1–3 weeks from kickoff to launch, depending on scope.",
    paymentStructure: PAYMENT_STRUCTURE,
  },
};

export function generateAgreementTerms(
  application: Pick<PartnerApplication, "tier" | "discount_percentage" | "business_name">,
): AgreementTerms {
  const tier = application.tier ?? "tier_3";
  const terms = TIER_TERMS[tier];

  return {
    tier,
    tierLabel: TIER_LABELS[tier],
    discountPercentage: application.discount_percentage ?? 0,
    businessName: application.business_name,
    generatedAt: new Date().toISOString(),
    ...terms,
  };
}
