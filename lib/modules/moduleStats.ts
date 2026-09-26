import { createServiceClient } from "@/lib/supabase";
import { MODULE_TYPES, type ModuleType } from "./constants";

// AI cost for drafting a module's form (lib/modules/formFromPrompt.ts) is
// logged to the MAIN VisionWorkx project's ai_usage_log with
// source: "module_config" -- not the visionworkx-modules project, and with
// no module_id/workspace_id column, so it can only be attributed as an
// aggregate average (total module_config spend / modules created), not a
// true per-module or per-type cost. Same "order of magnitude, not a bill"
// spirit as lib/apps/buildCost.ts's Cost per Build panel.
export type ModuleCostEstimate = {
  measuredDrafts: number;
  totalCostUsd: number;
  avgCostPerModuleUsd: number;
};

export async function fetchModuleCostEstimate(moduleCount: number): Promise<ModuleCostEstimate> {
  const service = createServiceClient();
  const { data, error } = await service.from("ai_usage_log").select("cost_usd").eq("source", "module_config");

  if (error || !data) {
    return { measuredDrafts: 0, totalCostUsd: 0, avgCostPerModuleUsd: 0 };
  }

  const totalCostUsd = data.reduce((sum, r) => sum + (Number(r.cost_usd) || 0), 0);
  return {
    measuredDrafts: data.length,
    totalCostUsd,
    avgCostPerModuleUsd: moduleCount === 0 ? 0 : totalCostUsd / moduleCount,
  };
}

export type ModuleTypeCounts = Record<ModuleType, number>;

export function countModulesByType(mods: { type: string }[]): ModuleTypeCounts {
  const counts = Object.fromEntries(MODULE_TYPES.map((t) => [t, 0])) as ModuleTypeCounts;
  for (const m of mods) {
    if ((MODULE_TYPES as readonly string[]).includes(m.type)) {
      counts[m.type as ModuleType] += 1;
    }
  }
  return counts;
}
