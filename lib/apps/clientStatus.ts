// The ONLY place that decides what a customer sees about a build.
//
// Two rules from docs/stabilization-plan.md (client-exposure work):
//   1. The client sees coarse phases and outcomes — never code, never
//      compiler errors, never repair counts, never "failed".
//   2. A hard failure renders as "almost there, we'll email you" ("settling").
//      The operator still gets the real status + failure_reason + alert; the
//      /admin dashboard reads app.status directly and must NOT use this module.

import type { AppStatus } from "@/lib/database.types";

export type BuildPhase = 1 | 2 | 3 | 4 | 5;

/** In-stream hint from /api/generate (`[[PHASE:x]]` markers). */
export type StreamPhase = "designing" | "building" | "reviewing";

export const BUILD_PHASES: { n: BuildPhase; label: string }[] = [
  { n: 1, label: "Designing your app" },
  { n: 2, label: "Building your pages & features" },
  { n: 3, label: "Reviewing everything" },
  { n: 4, label: "Publishing your app" },
  { n: 5, label: "Your app is live" },
];

export interface ClientBuildState {
  phase: BuildPhase;
  headline: string;
  sub: string;
  /** Phase 5 reached — app is live. */
  done: boolean;
  /**
   * The build failed under the hood. Shown as a calm "still finishing up";
   * the operator has been alerted and closes the loop by hand or by fix.
   */
  settling: boolean;
}

const PHASE_COPY: Record<BuildPhase, { headline: string; sub: string }> = {
  1: {
    headline: "Designing your app",
    sub: "Mapping out your data and the pages you'll need.",
  },
  2: {
    headline: "Building your app",
    sub: "Writing your pages and features. This usually takes about 5 minutes.",
  },
  3: {
    headline: "Reviewing everything",
    sub: "Checking the app over before we put it online.",
  },
  4: {
    headline: "Publishing your app",
    sub: "Putting your app online. You can leave this page — we'll email you when it's ready.",
  },
  5: {
    headline: "Your app is live",
    sub: "It's online and connected to your database.",
  },
};

const SETTLING = {
  headline: "Almost there",
  sub: "This one's taking a little longer than expected to finish. We've been notified and will email you the moment it's ready.",
};

/**
 * Resolve what the customer sees. `streamPhase` (from the live generate
 * stream) wins while it's present; otherwise the DB status drives it.
 */
export function clientBuildState(
  status: AppStatus | string | null | undefined,
  opts?: { streamPhase?: StreamPhase | null },
): ClientBuildState {
  const sp = opts?.streamPhase;
  if (sp) {
    const phase: BuildPhase = sp === "designing" ? 1 : sp === "building" ? 2 : 3;
    return { phase, ...PHASE_COPY[phase], done: false, settling: false };
  }

  switch (status) {
    case "deployed":
      return { phase: 5, ...PHASE_COPY[5], done: true, settling: false };
    case "ready":
    case "deploying":
      return { phase: 4, ...PHASE_COPY[4], done: false, settling: false };
    case "generating":
      return { phase: 3, ...PHASE_COPY[3], done: false, settling: false };
    case "failed":
    case "deploy_failed":
      // Never say "failed" to the customer.
      return { phase: 4, ...SETTLING, done: false, settling: true };
    default:
      // Unknown / pre-start — treat as the earliest phase.
      return { phase: 1, ...PHASE_COPY[1], done: false, settling: false };
  }
}
