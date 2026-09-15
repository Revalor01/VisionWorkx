// Canonical identifier for a golden-canary-generated app: a fixed
// canary+<key>@visionworkx.internal preview_email (see
// app/api/cron/canary-build/route.ts's canaryEmail()). Real users —
// including pre-signup "Phase 5b preview" apps — always have a real
// email domain, so this can't false-positive on a genuine customer.
//
// Single source of truth: this check used to be duplicated (once in
// lib/apps/productStability.ts, once as a raw LIKE pattern in
// canary-build/route.ts) — exactly the kind of drift that let canary
// rows leak into /admin's real-app stats undetected for a while (fixed
// in PR #46). Consolidated here so nothing drifts again.
export const CANARY_EMAIL_SUFFIX = "@visionworkx.internal";

export function isCanaryPreviewEmail(previewEmail: string | null | undefined): boolean {
  return previewEmail != null && previewEmail.endsWith(CANARY_EMAIL_SUFFIX);
}

// Cost lever added 2026-09-13: canary exists to validate pipeline
// mechanics (does the SQL run, does the build compile, does it deploy) —
// not code quality or polish, which is what a real customer actually
// pays for. A cheaper/faster model is a legitimate choice specifically
// because it never reaches a customer. Confirmed live: with 0 paying
// customers, canary alone was running ~$230/mo of Anthropic spend on
// claude-sonnet-4-6 generation + repair calls.
export const CANARY_MODEL = "claude-haiku-4-5-20251001";
export const STANDARD_MODEL = "claude-sonnet-4-6";

export function modelForApp(previewEmail: string | null | undefined): string {
  return isCanaryPreviewEmail(previewEmail) ? CANARY_MODEL : STANDARD_MODEL;
}
