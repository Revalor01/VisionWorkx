import type { LeadSignal } from "@/lib/database.types";

// ---------------------------------------------------------------
// Distance — straight-line (Haversine) miles from the search origin
// to a lead's coordinates. Not driving distance, just great-circle;
// good enough for "how far out is this lead" at the radii this tool
// searches (1-25 miles).
// ---------------------------------------------------------------

const EARTH_RADIUS_MILES = 3958.8;

export function distanceMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(EARTH_RADIUS_MILES * c * 100) / 100;
}

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
// Language detection — flags likely Spanish-speaking businesses so
// outreach can be pitched in the right language, and so businesses
// that are a good fit for VisionWorkx's bilingual EN/ES app feature
// are easy to filter for. This is a name-based heuristic, not a
// website-content check (that would need a scraper — same gap as the
// other Manual/Scrape signals in the formula doc). An explicit
// `name:es` tag is a strong signal; otherwise it falls back to
// Spanish accented characters and a short list of common business
// words. Defaults to "en" when nothing matches — this tool only
// searches US locations, so English is the safe default.
// ---------------------------------------------------------------

const SPANISH_ACCENT_PATTERN = /[áéíóúñ¿¡]/i;
const SPANISH_BUSINESS_WORDS = [
  "taqueria", "taquería", "panaderia", "panadería", "peluqueria", "peluquería",
  "lavanderia", "lavandería", "restaurante", "mercado", "carniceria", "carnicería",
  "salon de belleza", "salón de belleza", "farmacia", "ferreteria", "ferretería",
];

export function detectLanguage(tags: Record<string, string>, businessName: string): "en" | "es" {
  if (tags["name:es"] && tags["name:es"] === businessName) return "es";
  if (SPANISH_ACCENT_PATTERN.test(businessName)) return "es";
  const nameLower = businessName.toLowerCase();
  if (SPANISH_BUSINESS_WORDS.some((word) => nameLower.includes(word))) return "es";
  return "en";
}

// ---------------------------------------------------------------
// Scoring — Tiers 1, 3, and the industry multiplier are computed
// from OSM tags alone (Auto-tier signals per the reference doc).
// Yelp enrichment (optional — only present when YELP_API_KEY is set
// and a match was found) adds the review-count/rating Tier 3 signals
// and the review-text pain-keyword Tier 2 signal. Most of Tier 2
// (booking/payment scrape signals) and Tier 4 (years operating) still
// aren't wired up — no website scraper yet — so they contribute 0
// rather than being silently assumed absent. Every fired signal is
// recorded in signal_breakdown so a score is always auditable, not
// just a number.
// ---------------------------------------------------------------

export interface ScorableLead {
  website?: string | null;
  phone?: string | null;
  email?: string | null;
  openingHours?: string | null;
  hasFacebookOnly?: boolean;
  industryMultiplier: number;
  yelpReviewCount?: number | null;
  yelpRating?: number | null;
  yelpReviewsHavePainSignal?: boolean;
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

  // Tier 3 — Yelp-derived (only present with a Yelp match)
  if (lead.yelpReviewCount !== undefined && lead.yelpReviewCount !== null) {
    if (lead.yelpReviewCount < 10) {
      signals.push({ tier: 3, label: "Fewer than 10 reviews", points: 15, detection: "api" });
    }
  }
  if (lead.yelpRating !== undefined && lead.yelpRating !== null) {
    if (lead.yelpRating < 4.0) {
      signals.push({ tier: 3, label: "Rating below 4.0", points: 15, detection: "api" });
    }
  }

  // Tier 2 — Yelp-derived (best-effort: only the up-to-3 excerpts the
  // free API returns, not a full review scan)
  if (lead.yelpReviewsHavePainSignal) {
    signals.push({ tier: 2, label: "Review mentions booking / wait problems", points: 30, detection: "api" });
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
