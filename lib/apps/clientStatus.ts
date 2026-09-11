// The ONLY place that decides what a customer sees about a build.
//
// Two rules from docs/stabilization-plan.md (client-exposure work):
//   1. The client sees coarse phases and outcomes — never code, never
//      compiler errors, never repair counts, never the raw word "failed".
//   2. A hard failure is acknowledged, not hidden: the client is told
//      "we've run into an issue and are resolving it" and shown an update
//      panel (apps.build_notice, auto-written on failure, operator-editable).
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
   * The build hit a hard failure. The client is TOLD (headline "We've run into
   * an issue"), shown `notice` in an update panel, and told updates will land
   * there + by email. The operator has been alerted and closes the loop.
   */
  settling: boolean;
  /** Latest customer-facing update (apps.build_notice), when settling. */
  notice: string | null;
  noticeAt: string | null;
}

/** Default auto-notice written by the pipeline on a hard failure. */
export const DEFAULT_BUILD_NOTICE =
  "We've run into an issue finishing your app. Our team was notified automatically and is working to resolve it — we'll post updates here and email you the moment it's ready.";

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
  headline: "We've run into an issue",
  sub: "Our team is on it. Updates will show below and we'll email you the moment your app is ready.",
};

/**
 * Resolve what the customer sees. `streamPhase` (from the live generate
 * stream) wins while it's present; otherwise the DB status drives it.
 */
export function clientBuildState(
  status: AppStatus | string | null | undefined,
  opts?: {
    streamPhase?: StreamPhase | null;
    notice?: string | null;
    noticeAt?: string | null;
  },
): ClientBuildState {
  const base = { done: false, settling: false, notice: null, noticeAt: null };
  const sp = opts?.streamPhase;
  if (sp) {
    const phase: BuildPhase = sp === "designing" ? 1 : sp === "building" ? 2 : 3;
    return { phase, ...PHASE_COPY[phase], ...base };
  }

  switch (status) {
    case "deployed":
      return { phase: 5, ...PHASE_COPY[5], ...base, done: true };
    case "ready":
    case "deploying":
      return { phase: 4, ...PHASE_COPY[4], ...base };
    case "generating":
      return { phase: 3, ...PHASE_COPY[3], ...base };
    case "failed":
    case "deploy_failed":
      // Acknowledged, not hidden — and never the raw word "failed".
      return {
        phase: 4,
        ...SETTLING,
        ...base,
        settling: true,
        notice: opts?.notice ?? DEFAULT_BUILD_NOTICE,
        noticeAt: opts?.noticeAt ?? null,
      };
    default:
      return { phase: 1, ...PHASE_COPY[1], ...base };
  }
}
