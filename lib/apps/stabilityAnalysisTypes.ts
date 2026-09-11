// Shared shape between app/api/admin/stability-analysis (writer) and
// app/admin/StabilityTab.tsx (reader) — one Claude-generated diagnostic
// pass over the current build-reliability data. Advisory only: nothing
// here executes a fix, the operator reads it and decides.

import type { StabilityBand } from "./productStability";

export type StabilityFinding = { title: string; detail: string };

export type StabilityAnalysis = {
  id: string;
  created_at: string;
  band: StabilityBand;
  completion_rate_pct: number | null;
  issues: StabilityFinding[];
  recommendations: StabilityFinding[];
  model: string;
  cost_usd: number | null;
};
