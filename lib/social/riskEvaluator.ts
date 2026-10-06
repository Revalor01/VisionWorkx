import type { BrandAudience } from "@/lib/social/brandMediaPolicy";

export type RiskLevel = "low" | "medium" | "high";
export type AutonomyMode = "manual" | "semi_autonomous" | "fully_autonomous";
export type ApprovalStatus = "auto" | "review" | "reject";

export function containsBannedWords(copy: string, bannedWords: string[]): string[] {
  const lower = copy.toLowerCase();
  return bannedWords.filter((word) => word.trim() && lower.includes(word.toLowerCase()));
}

// Kids-brand safety net: terms that should never appear in a kids/family post,
// whether off-brand (the business/VisionWorkx product line) or not age-
// appropriate. Matched on word boundaries (so "pills" doesn't trip on "spills").
// A hit holds the post for human review — it never auto-publishes — but doesn't
// hard-reject or pause the brand, so nothing is lost.
export const KIDS_UNSAFE_TERMS = [
  // off-brand: a kids post must be about the kids apps (Chorebit, FeelFlow, MindBit), not these
  "visionworkx", "proactive", "revalor consulting", "consulting", "enterprise", "b2b", "saas",
  "small business", "lead capture", "booking module", "quote calculator", "invoice", "invoicing",
  // not appropriate for a young-family audience
  "supplement", "supplements", "medication", "pills", "alcohol", "beer", "wine", "vape", "vaping",
  "gambling", "casino", "crypto", "weight loss", "dating",
];

function matchesAny(copy: string, terms: string[]): string[] {
  const lower = copy.toLowerCase();
  return terms.filter((t) => new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(lower));
}

export function evaluateApproval(params: {
  copy: string;
  riskLevel: RiskLevel;
  bannedWords: string[];
  autonomyMode: AutonomyMode;
  // The brand's audience (lib/social/brandMediaPolicy). "kids" adds a safety
  // net and never lets a kids brand run fully-autonomous.
  audience?: BrandAudience;
}): { status: ApprovalStatus; reason: string | null } {
  const { copy, riskLevel, bannedWords, autonomyMode, audience } = params;

  const foundBannedWords = containsBannedWords(copy, bannedWords);
  if (foundBannedWords.length > 0) {
    return { status: "reject", reason: `Contains banned words: ${foundBannedWords.join(", ")}` };
  }

  // Kids safety: off-brand or not-age-appropriate copy is held for review,
  // never auto-published, regardless of the model's self-rated risk.
  if (audience === "kids") {
    const concerns = matchesAny(copy, KIDS_UNSAFE_TERMS);
    if (concerns.length > 0) {
      return { status: "review", reason: `Not kid-appropriate / off-brand for a kids brand: ${concerns.join(", ")}` };
    }
  }

  // Kids brands never run fully-autonomous — cap their effective mode so medium/
  // high self-rated risk always goes to review.
  const effectiveMode: AutonomyMode = audience === "kids" && autonomyMode === "fully_autonomous" ? "semi_autonomous" : autonomyMode;

  if (effectiveMode === "manual") {
    return { status: "review", reason: "Manual mode — all autonomous posts require review" };
  }

  if (effectiveMode === "semi_autonomous") {
    if (riskLevel === "low") return { status: "auto", reason: null };
    return { status: "review", reason: `Risk level: ${riskLevel}` };
  }

  // fully_autonomous
  if (riskLevel === "high") {
    return { status: "review", reason: "High risk content in fully-autonomous mode" };
  }
  return { status: "auto", reason: null };
}
