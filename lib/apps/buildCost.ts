// Per-build cost model for the /admin "Cost per build" panel.
//
// AI cost is ACTUAL — summed from ai_usage_log rows tagged with the app_id
// (app_generate + app_generate_plan + app_deploy_repair, including every
// repair round and the automatic retry).
//
// Everything below is an ESTIMATE. Tune the constants against real Vercel
// / Resend invoices. They're intentionally rough — the point is to know
// the order of magnitude for pricing, not to bill anyone.

export const BUILD_COST_ESTIMATES = {
  // Our own /api/generate + /api/deploy function time on Vercel Fluid
  // Compute (Active CPU + invocations) for one build — ~10-15 min of a
  // long-lived function across the two routes.
  ourComputeUsd: 0.12,
  // The customer app's Vercel build (npm install + next build) — ~2-4 min
  // of build compute, once per deploy plus any repair redeploys.
  vercelBuildUsd: 0.04,
  // Resend transactional emails per build (build-complete + any operator
  // alert).
  emailUsd: 0.003,
  // Supabase: one more tenant schema in the shared project — a rounding
  // error until real scale.
  supabaseUsd: 0,
} as const;

export function estimatedBuildInfraUsd(): number {
  const e = BUILD_COST_ESTIMATES;
  return e.ourComputeUsd + e.vercelBuildUsd + e.emailUsd + e.supabaseUsd;
}

// Costs that are real but deliberately NOT attributed per build — they
// accrue later and scale with the customer, not the build. Surface this
// list next to the numbers so pricing decisions account for it.
export const UNMODELED_COSTS: string[] = [
  "Ongoing app hosting — the customer app's Vercel function calls, bandwidth and build minutes on every later change; scales with their traffic",
  "Supabase compute & egress at scale (shared project — negligible per tenant today, real at volume)",
  "Custom domains on Growth/Pro (Vercel domain registration + certs)",
  "Your time — Guided Build Sessions and change requests you handle by hand",
  "Stripe fees on the subscription itself (~2.9% + $0.30 per monthly charge)",
  "Anthropic usage from change requests (app_edit) after the first build",
];
