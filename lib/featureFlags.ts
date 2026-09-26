import { NextResponse } from "next/server";
import { ADMIN_EMAIL } from "@/lib/adminSso";

// Full-app generation freeze (A3). VisionWorkx is moving from generating and
// hosting whole apps to embeddable website modules, so starting new builds is
// OFF unless FULL_APP_GENERATION=true is set. Defaults to off on purpose: a
// missing env var must never re-open the builder.
//
// The operator (ADMIN_EMAIL) can still build for testing. This only reads the
// existing admin email constant — it doesn't touch the shared admin SSO.
//
// Existing deployed apps keep running; only *starting* builds, regenerating,
// change requests, guided sessions, plan checkout and the nightly canary are
// gated. The prompt-to-config code (recommendBuild, generatePlan) is kept for
// configuring modules later.

// Kept under its original name (API responses expose it as `waitlistUrl`);
// now points at the modules free-trial signup.
export const WAITLIST_URL = "https://modules.revalorllc.com/start";

export const GENERATION_PAUSED_MESSAGE =
  "VisionWorkx is moving to website modules, so new app builds are paused. " +
  `Try modules free for 14 days: ${WAITLIST_URL}`;

export function fullAppGenerationEnabled(): boolean {
  return process.env.FULL_APP_GENERATION === "true";
}

/** True when the flag is on, or when the signed-in user is the operator. */
export function canUseFullAppGeneration(email: string | null | undefined): boolean {
  return fullAppGenerationEnabled() || (!!email && email.toLowerCase() === ADMIN_EMAIL);
}

export function generationPausedResponse() {
  return NextResponse.json(
    { error: GENERATION_PAUSED_MESSAGE, code: "generation_paused", waitlistUrl: WAITLIST_URL },
    { status: 403 },
  );
}
