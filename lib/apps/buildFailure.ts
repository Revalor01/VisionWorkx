// Classify why a build failed so the /generate screen can tell the
// customer whether to wait (our problem) or retry (their app), and so the
// operator alert leads with the real cause instead of a generic subject.

export type BuildFailureReason =
  | "anthropic_credits"
  | "anthropic_overloaded"
  | "anthropic_rate_limit"
  | "timeout"
  | "build_error"
  | "generation";

export function classifyBuildError(errText: string): BuildFailureReason {
  const s = (errText || "").toLowerCase();
  if (/credit balance is too low|insufficient (credit|balance|funds)|plans & billing|payment required/.test(s))
    return "anthropic_credits";
  if (/overloaded|529/.test(s)) return "anthropic_overloaded";
  if (/rate limit|rate_limit|429|too many requests/.test(s)) return "anthropic_rate_limit";
  if (/timed out after|task timed out|\btimeout\b|etimedout/.test(s)) return "timeout";
  if (/build error|failed to compile|buildererror/.test(s)) return "build_error";
  return "generation";
}

/** Infra failures are on us — the customer just waits for an email. */
export function isInfraFailure(r: BuildFailureReason): boolean {
  return (
    r === "anthropic_credits" ||
    r === "anthropic_overloaded" ||
    r === "anthropic_rate_limit" ||
    r === "timeout"
  );
}

export function customerFailureMessage(r: BuildFailureReason | string | null): string {
  const reason = (r ?? "generation") as BuildFailureReason;
  if (isInfraFailure(reason)) {
    return "This one's on us — a temporary system issue on our side, not your app. We've been alerted and we'll email you the moment it's building again. Your answers are saved, nothing to redo.";
  }
  return "The build didn't finish. Your details are saved — hit “Try again”, it usually works on the second run.";
}

/** Loud operator-alert headline for the reasons that need immediate action. */
export function operatorAlertTitle(r: BuildFailureReason): string | null {
  switch (r) {
    case "anthropic_credits":
      return "🔴 ANTHROPIC CREDITS EXHAUSTED — every build is down until credits are added";
    case "anthropic_overloaded":
      return "⚠️ Anthropic overloaded — builds failing (usually transient)";
    case "anthropic_rate_limit":
      return "⚠️ Anthropic rate limit hit — builds failing";
    case "timeout":
      return "⚠️ Build timed out — too large, or the pipeline stalled";
    default:
      return null;
  }
}
