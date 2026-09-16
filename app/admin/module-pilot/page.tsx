import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createServerClient, createServiceClient } from "@/lib/supabase";
import { ADMIN_SSO_COOKIE, ADMIN_EMAIL, verifySessionCookie } from "@/lib/adminSso";
import AdminNavBar from "../AdminNavBar";

// Mirrors supabase/migrations/20240101000080_module_pilot_runs.sql. Not in
// database.types.ts's generated-looking union since that file is hand-
// maintained here (no codegen script) — added inline rather than touching
// the shared file for one page's read-only shape.
type ModulePilotRun = {
  id: string;
  pilot_name: string;
  app_id: string | null;
  outcome: "pass" | "core_failed" | "module_failed" | "regression_failed" | "blocked" | "error";
  outcome_detail: string | null;
  generate_duration_sec: number | null;
  generate_status: string | null;
  edit_duration_sec: number | null;
  edit_status: string | null;
  regression_duration_sec: number | null;
  regression_status: string | null;
  costs: { source: string; model: string; inputTokens: number; outputTokens: number; costUsd: number }[];
  total_cost_usd: number;
  total_duration_ms: number | null;
  run_at: string;
};

const OUTCOME_STYLE: Record<ModulePilotRun["outcome"], string> = {
  pass: "bg-green-500/20 text-green-300",
  blocked: "bg-zinc-500/20 text-zinc-300",
  core_failed: "bg-red-500/20 text-red-300",
  module_failed: "bg-red-500/20 text-red-300",
  regression_failed: "bg-orange-500/20 text-orange-300",
  error: "bg-red-500/20 text-red-300",
};

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function mean(values: number[]): number | null {
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : null;
}

function fmtSec(sec: number | null): string {
  if (sec == null) return "—";
  if (sec < 90) return `${sec.toFixed(1)}s`;
  return `${(sec / 60).toFixed(1)}m`;
}

export default async function ModulePilotPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  const cookieStore = await cookies();
  const isSsoAdmin = verifySessionCookie(cookieStore.get(ADMIN_SSO_COOKIE)?.value, ADMIN_EMAIL);
  const isRealAdmin = !authError && !!user && user.email === ADMIN_EMAIL;
  if (!isRealAdmin && !isSsoAdmin) redirect("/dashboard");

  const service = createServiceClient();
  const { data, error } = await service
    .from("module_pilot_runs")
    .select("*")
    .order("run_at", { ascending: false });

  const runs = (data ?? []) as ModulePilotRun[];
  const byPilot = new Map<string, ModulePilotRun[]>();
  for (const r of runs) {
    (byPilot.get(r.pilot_name) ?? byPilot.set(r.pilot_name, []).get(r.pilot_name)!).push(r);
  }

  return (
    <div className="min-h-screen bg-[#121212]">
      <header className="bg-[#1A3A5C] text-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold tracking-tight">Vision Workx</span>
          <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full font-medium">Module Pilot</span>
        </div>
        <a href="/admin" className="text-xs text-white/70 hover:text-white transition-colors">
          ← Back to Admin
        </a>
      </header>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <AdminNavBar category="operations" current="module-pilot" />

        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">Module Pilot: shrink-the-core viability</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Every run of <code className="text-zinc-300">scripts/pilot-crm-module.mjs</code> — generate a
            minimal core, apply a curated module through the real edit pipeline, regression-check the
            core still works. Real cost and timing, not an estimate — this is the data to judge whether
            the core+module architecture is worth switching to.
          </p>
        </div>

        {error && (
          <div className="mb-4 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
            Failed to load: {error.message}
          </div>
        )}

        {!error && runs.length === 0 && (
          <div className="text-sm text-zinc-500 bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-6 text-center">
            No pilot runs recorded yet. Run{" "}
            <code className="text-zinc-300">node scripts/pilot-crm-module.mjs</code> to get the first one.
          </div>
        )}

        {[...byPilot.entries()].map(([pilotName, pilotRuns]) => {
          const passed = pilotRuns.filter((r) => r.outcome === "pass");
          const blocked = pilotRuns.filter((r) => r.outcome === "blocked");
          const failed = pilotRuns.filter(
            (r) => r.outcome !== "pass" && r.outcome !== "blocked",
          );
          // Averages are computed over PASSED runs only — a blocked run
          // ($0, near-instant) or a mid-pipeline failure isn't a real data
          // point for "what does this cost/take when it works", and mixing
          // them in would understate both. Denominator shown alongside
          // every average so it's never mistaken for "all runs".
          const avgCost = mean(passed.map((r) => r.total_cost_usd));
          const avgTotalSec = mean(passed.map((r) => (r.total_duration_ms ?? 0) / 1000));
          const avgGenerateSec = mean(
            passed.map((r) => r.generate_duration_sec).filter((v): v is number => v != null),
          );
          const avgEditSec = mean(
            passed.map((r) => r.edit_duration_sec).filter((v): v is number => v != null),
          );
          const totalSpent = pilotRuns.reduce((s, r) => s + r.total_cost_usd, 0);
          const passRate = pilotRuns.length ? passed.length / pilotRuns.length : null;

          return (
            <div key={pilotName} className="mb-10">
              <h2 className="text-sm font-bold text-white uppercase tracking-wide mb-3">
                {pilotName.replace(/_/g, " ")}
              </h2>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-6">
                <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
                  <div className="text-xs uppercase tracking-wide text-zinc-500">Pass rate</div>
                  <div className="mt-1 text-xl font-semibold text-white">
                    {passed.length}/{pilotRuns.length}
                    {passRate != null && (
                      <span className="text-sm text-zinc-500 ml-1.5">
                        ({Math.round(passRate * 100)}%)
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-zinc-500 mt-1">
                    {blocked.length} blocked · {failed.length} failed
                  </div>
                </div>
                <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
                  <div className="text-xs uppercase tracking-wide text-zinc-500">Avg cost</div>
                  <div className="mt-1 text-xl font-semibold text-white">
                    {avgCost != null ? `$${avgCost.toFixed(4)}` : "—"}
                  </div>
                  <div className="text-xs text-zinc-500 mt-1">over {passed.length} passed run(s)</div>
                </div>
                <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
                  <div className="text-xs uppercase tracking-wide text-zinc-500">Avg total time</div>
                  <div className="mt-1 text-xl font-semibold text-white">
                    {avgTotalSec != null ? fmtSec(avgTotalSec) : "—"}
                  </div>
                  <div className="text-xs text-zinc-500 mt-1">
                    generate {fmtSec(avgGenerateSec)} · edit {fmtSec(avgEditSec)}
                  </div>
                </div>
                <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
                  <div className="text-xs uppercase tracking-wide text-zinc-500">Total spent</div>
                  <div className="mt-1 text-xl font-semibold text-white">${totalSpent.toFixed(4)}</div>
                  <div className="text-xs text-zinc-500 mt-1">across all {pilotRuns.length} run(s)</div>
                </div>
              </div>

              <div className="space-y-2">
                {pilotRuns.map((r) => (
                  <div key={r.id} className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`text-xs font-medium px-2 py-0.5 rounded-full ${OUTCOME_STYLE[r.outcome]}`}
                        >
                          {r.outcome}
                        </span>
                        <span className="text-xs text-zinc-500 font-mono">
                          ${r.total_cost_usd.toFixed(4)}
                        </span>
                        <span className="text-xs text-zinc-500">
                          {fmtSec((r.total_duration_ms ?? 0) / 1000)}
                        </span>
                        {r.app_id && (
                          <span className="text-xs text-zinc-600 font-mono">{r.app_id.slice(0, 8)}</span>
                        )}
                      </div>
                      <span className="text-xs text-zinc-500" title={r.run_at}>
                        {timeAgo(r.run_at)}
                      </span>
                    </div>
                    {r.outcome === "pass" && (
                      <div className="text-xs text-zinc-500 mt-1.5">
                        generate {fmtSec(r.generate_duration_sec)} · edit {fmtSec(r.edit_duration_sec)} ·
                        regression {fmtSec(r.regression_duration_sec)}
                      </div>
                    )}
                    {r.outcome_detail && (
                      <p className="text-sm text-zinc-300 mt-1.5">{r.outcome_detail}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
