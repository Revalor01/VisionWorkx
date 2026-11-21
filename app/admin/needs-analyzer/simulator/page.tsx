import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isOperator } from "@/lib/modules/adminGuard";
import { ECON_DEFAULTS } from "@/lib/needsAnalyzer/economics";
import { loadSettings, naDb } from "@/lib/needsAnalyzer/db";
import BuildSimulator from "../BuildSimulator";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Website Build Simulator · Needs Analyzer", robots: { index: false, follow: false } };

// Website Build Simulator: high-level website choices → every step from hosting to
// deployment, hours, price and running costs (lib/needsAnalyzer/buildSim.ts).
// Starts from the internal rate and target margin in Catalog & pricing.
export default async function SimulatorPage() {
  if (!(await isOperator())) redirect("/dashboard");
  const { catalog } = await loadSettings(naDb());
  const s = catalog.settings;
  return (
    <BuildSimulator
      currency={s?.currency ?? "$"}
      internalRate={s?.internalRate || ECON_DEFAULTS.internalRate}
      targetMarginPct={s?.targetMarginPct ?? ECON_DEFAULTS.targetMarginPct}
    />
  );
}
