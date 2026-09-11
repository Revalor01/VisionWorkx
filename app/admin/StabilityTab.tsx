"use client";

import { useState } from "react";
import type { BuildOutcomes, ProductStability, StabilityBand } from "@/lib/apps/productStability";
import { stabilityBand } from "@/lib/apps/productStability";
import type { StabilityAnalysis, StabilityFinding } from "@/lib/apps/stabilityAnalysisTypes";

// The dedicated Product Stability screen: a continuous %-based traffic
// light (distinct from the all-or-nothing STABLE/NOT STABLE gate on the
// Overview banner — see productStability.ts's stabilityBand() docstring)
// plus an on-demand "Analyze with Claude" diagnostic. Advisory only:
// Claude reads the same build/canary data shown elsewhere on /admin and
// writes back issues + recommendations; nothing here executes anything.
// The operator reads the output and decides what, if anything, to act on.

const BAND_STYLE: Record<StabilityBand, { border: string; bg: string; text: string; label: string }> = {
  green: { border: "border-green-500", bg: "bg-green-50", text: "text-green-700", label: "Green" },
  amber: { border: "border-amber-500", bg: "bg-amber-50", text: "text-amber-700", label: "Amber" },
  red: { border: "border-red-500", bg: "bg-red-50", text: "text-red-700", label: "Red" },
};

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-[#B8860B] p-6">
      <h2 className="font-semibold text-zinc-900 mb-1">{title}</h2>
      {subtitle && <p className="text-xs text-zinc-500 mb-4">{subtitle}</p>}
      {children}
    </div>
  );
}

function FindingList({ items, empty }: { items: StabilityFinding[]; empty: string }) {
  if (items.length === 0) return <p className="text-sm text-zinc-500">{empty}</p>;
  return (
    <ul className="space-y-2.5">
      {items.map((f, i) => (
        <li key={i} className="text-sm">
          <p className="font-medium text-zinc-800">{f.title}</p>
          <p className="text-zinc-500 mt-0.5">{f.detail}</p>
        </li>
      ))}
    </ul>
  );
}

export function StabilityTab({
  buildOutcomes,
  productStability,
  initialAnalyses,
}: {
  buildOutcomes: BuildOutcomes;
  productStability: ProductStability;
  initialAnalyses: StabilityAnalysis[];
}) {
  const [analyses, setAnalyses] = useState(initialAnalyses);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pct = buildOutcomes.d30.pctComplete;
  const band: StabilityBand = pct != null ? stabilityBand(pct) : productStability.stable ? "green" : "red";
  const style = BAND_STYLE[band];
  const latest = analyses[0] ?? null;

  async function runAnalysis() {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/stability-analysis", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      setAnalyses((prev) => [data.analysis as StabilityAnalysis, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className={`rounded-2xl border-2 p-5 ${style.border} ${style.bg}`}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className={`text-xl font-extrabold tracking-tight ${style.text}`}>
              {style.label}
              {pct != null && <span className="font-semibold"> — {Math.round(pct * 100)}% complete</span>}
            </p>
            <p className="text-xs text-zinc-500 mt-1">
              Real-app 30-day completion rate ({buildOutcomes.d30.deployed}/{buildOutcomes.d30.terminal} terminal
              builds{pct == null ? " — not enough data yet" : ""}). Green ≥85%, amber 70–84%, red &lt;70%.
            </p>
          </div>
          <button
            onClick={runAnalysis}
            disabled={running}
            className="shrink-0 px-4 py-2.5 rounded-xl bg-[#1A3A5C] text-white text-sm font-semibold hover:bg-[#2E6DA4] disabled:opacity-50 transition-colors"
          >
            {running ? "Analyzing…" : "Analyze with Claude"}
          </button>
        </div>
        {error && <p className="text-sm text-red-600 mt-3">Analysis failed: {error}</p>}
      </div>

      {!productStability.stable && (
        <Section title="Why the Overview banner reads NOT STABLE">
          <ul className="text-sm text-red-700 list-disc list-inside space-y-1">
            {productStability.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </Section>
      )}

      {latest ? (
        <Section
          title="Latest analysis"
          subtitle={`${new Date(latest.created_at).toLocaleString()} · ${BAND_STYLE[latest.band].label} at the time${
            latest.cost_usd != null ? ` · $${latest.cost_usd.toFixed(4)}` : ""
          }`}
        >
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-red-600 mb-2">Issues</p>
              <FindingList items={latest.issues} empty="Claude didn't identify any specific issues." />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-green-600 mb-2">Recommendations</p>
              <FindingList items={latest.recommendations} empty="No recommendations returned." />
            </div>
          </div>
        </Section>
      ) : (
        <Section title="No analysis yet">
          <p className="text-sm text-zinc-500">
            Press &quot;Analyze with Claude&quot; to get a written read on what&apos;s driving the current number and
            what to do about it. This only reads existing build/canary data — it never changes anything on its own.
          </p>
        </Section>
      )}

      {analyses.length > 1 && (
        <Section title="Previous analyses">
          <div className="space-y-4 divide-y divide-zinc-100">
            {analyses.slice(1).map((a) => (
              <div key={a.id} className="pt-4 first:pt-0">
                <p className="text-xs text-zinc-500 mb-2">
                  {new Date(a.created_at).toLocaleString()} · {BAND_STYLE[a.band].label}
                  {a.completion_rate_pct != null ? ` · ${Math.round(a.completion_rate_pct)}%` : ""}
                  {a.cost_usd != null ? ` · $${a.cost_usd.toFixed(4)}` : ""}
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FindingList items={a.issues} empty="No issues recorded." />
                  <FindingList items={a.recommendations} empty="No recommendations recorded." />
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}
