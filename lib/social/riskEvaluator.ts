export type RiskLevel = "low" | "medium" | "high";
export type AutonomyMode = "manual" | "semi_autonomous" | "fully_autonomous";
export type ApprovalStatus = "auto" | "review" | "reject";

export function containsBannedWords(copy: string, bannedWords: string[]): string[] {
  const lower = copy.toLowerCase();
  return bannedWords.filter((word) => word.trim() && lower.includes(word.toLowerCase()));
}

export function evaluateApproval(params: {
  copy: string;
  riskLevel: RiskLevel;
  bannedWords: string[];
  autonomyMode: AutonomyMode;
}): { status: ApprovalStatus; reason: string | null } {
  const { copy, riskLevel, bannedWords, autonomyMode } = params;

  const foundBannedWords = containsBannedWords(copy, bannedWords);
  if (foundBannedWords.length > 0) {
    return { status: "reject", reason: `Contains banned words: ${foundBannedWords.join(", ")}` };
  }

  if (autonomyMode === "manual") {
    return { status: "review", reason: "Manual mode — all autonomous posts require review" };
  }

  if (autonomyMode === "semi_autonomous") {
    if (riskLevel === "low") return { status: "auto", reason: null };
    return { status: "review", reason: `Risk level: ${riskLevel}` };
  }

  // fully_autonomous
  if (riskLevel === "high") {
    return { status: "review", reason: "High risk content in fully-autonomous mode" };
  }
  return { status: "auto", reason: null };
}
