import type { LeadSignal } from "@/lib/database.types";

// ---------------------------------------------------------------
// Industry classification — maps raw OSM tags to the multiplier
// tiers from reference/visionworkx_lead_signals.html (Formula tab).
// Approximate by nature: OSM tagging doesn't map 1:1 onto the doc's
// categories, so this is a best-effort heuristic, not a certainty.
// ---------------------------------------------------------------

export interface IndustryClassification {
  category: string;
  multiplier: number;
}

const PERFECT_FIT = 1.3;
const STRONG_FIT = 1.1;
const MODERATE_FIT = 1.0;
const LOW_FIT = 0.25; // dropped from the doc's original 0.6 — see review notes

export function classifyIndustry(tags: Record<string, string>): IndustryClassification {
  const shop = tags.shop;
  const amenity = tags.amenity;
  const craft = tags.craft;
  const leisure = tags.leisure;
  const sport = tags.sport;

  if (shop === "hairdresser" || shop === "beauty" || shop === "tattoo") {
    return { category: "Salon / Barbershop", multiplier: PERFECT_FIT };
  }
  if (craft === "electrician" || craft === "plumber" || craft === "hvac" || shop === "trade") {
    return { category: "Trades", multiplier: PERFECT_FIT };
  }
  if (amenity === "gym" || (leisure === "fitness_centre" && sport !== "yoga")) {
    return { category: "Gym", multiplier: PERFECT_FIT };
  }
  if (shop === "car_repair") {
    return { category: "Auto Repair", multiplier: PERFECT_FIT };
  }
  if (shop === "laundry" || shop === "dry_cleaning") {
    return { category: "Cleaning", multiplier: PERFECT_FIT };
  }
  if (amenity === "restaurant" || amenity === "cafe") {
    return { category: "Restaurant", multiplier: STRONG_FIT };
  }
  if (amenity === "dentist") {
    return { category: "Dentist", multiplier: STRONG_FIT };
  }
  if (shop === "pet" || amenity === "veterinary") {
    return { category: "Pet Care", multiplier: STRONG_FIT };
  }
  if (leisure === "fitness_centre" && sport === "yoga") {
    return { category: "Yoga / Wellness", multiplier: STRONG_FIT };
  }
  if (shop === "florist") {
    return { category: "Florist", multiplier: MODERATE_FIT };
  }
  if (shop === "convenience") {
    return { category: "Convenience", multiplier: MODERATE_FIT };
  }
  if (amenity === "bar" || amenity === "pub") {
    return { category: "Bar", multiplier: LOW_FIT };
  }
  if (amenity === "fast_food") {
    return { category: "Fast Food", multiplier: LOW_FIT };
  }
  if (shop) {
    return { category: "Retail", multiplier: MODERATE_FIT };
  }
  return { category: "Unclassified", multiplier: MODERATE_FIT };
}

// ---------------------------------------------------------------
// Scoring — Tiers 1, 3, and the industry multiplier are computed
// from OSM tags alone (Auto-tier signals per the reference doc).
// Tier 2 (booking/payment/review-text signals) and most of Tier 4
// (years operating) need a website scraper or paid review APIs —
// not wired up in this first version, so they contribute 0 rather
// than being silently assumed absent. Every fired signal is recorded
// in signal_breakdown so a score is always auditable, not just a
// number.
// ---------------------------------------------------------------

export interface ScorableLead {
  website?: string | null;
  phone?: string | null;
  email?: string | null;
  openingHours?: string | null;
  hasFacebookOnly?: boolean;
  industryMultiplier: number;
}

export interface ScoreResult {
  rawScore: number;
  finalScore: number;
  signalBreakdown: LeadSignal[];
}

export function scoreLead(lead: ScorableLead): ScoreResult {
  const signals: LeadSignal[] = [];

  // Tier 1 — Digital Absence (max 50 in this version; GMB-unclaimed
  // is Manual-tagged in the doc and isn't computed here)
  if (!lead.website && !lead.hasFacebookOnly) {
    signals.push({ tier: 1, label: "No website of any kind", points: 50, detection: "auto" });
  } else if (lead.hasFacebookOnly) {
    signals.push({ tier: 1, label: "Facebook only (no domain)", points: 30, detection: "auto" });
  }

  // Tier 3 — Digital Neglect Signals
  if (!lead.phone) {
    signals.push({ tier: 3, label: "No phone number listed", points: 20, detection: "auto" });
  }
  if (!lead.openingHours) {
    signals.push({ tier: 3, label: "No business hours listed", points: 15, detection: "auto" });
  }
  if (!lead.email) {
    signals.push({ tier: 3, label: "No email address", points: 10, detection: "auto" });
  }

  const rawScore = signals.reduce((sum, s) => sum + s.points, 0);
  const finalScore = Math.min(Math.round(rawScore * lead.industryMultiplier), 100);

  return { rawScore, finalScore, signalBreakdown: signals };
}

// Score bucket labels, matching the reference doc's summary bar.
export function scoreBucket(finalScore: number): { label: string; tier: "hot" | "warm" | "potential" | "low" } {
  if (finalScore >= 80) return { label: "Hot Lead", tier: "hot" };
  if (finalScore >= 50) return { label: "Warm Lead", tier: "warm" };
  if (finalScore >= 25) return { label: "Potential", tier: "potential" };
  return { label: "Low Fit", tier: "low" };
}
