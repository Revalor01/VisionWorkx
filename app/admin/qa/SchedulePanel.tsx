"use client";

import { useState } from "react";
import { CADENCE_LABEL, CADENCES, type Cadence, type ProductCadence } from "@/lib/qa/schedule";

// Operator control for how often each product's full QA run is dispatched: a
// global default plus a per-product override. Saves to /api/admin/qa/schedule;
// the /api/cron/qa-schedule cron reads it daily and dispatches what's due.

const SELECT = "rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-900 focus:border-[#B8860B] focus:outline-none focus:ring-1 focus:ring-[#B8860B]";

export default function SchedulePanel({
  products,
  initialGlobal,
  initialOverrides,
}: {
  products: { slug: string; name: string }[];
  initialGlobal: Cadence;
  initialOverrides: Record<string, ProductCadence>;
}) {
  const [global, setGlobal] = useState<Cadence>(initialGlobal);
  const [overrides, setOverrides] = useState<Record<string, ProductCadence>>(initialOverrides);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function setFor(slug: string, value: ProductCadence) {
    setOverrides((o) => ({ ...o, [slug]: value }));
    setMsg(null);
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/qa/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ global, products: overrides }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Couldn't save.");
      setMsg({ ok: true, text: "Schedule saved." });
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "Couldn't save." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <details className="mb-8 rounded-xl border-2 border-[#B8860B] bg-white">
      <summary className="cursor-pointer list-none p-4 sm:p-5">
        <span className="text-lg font-bold text-navy-dark">Testing schedule</span>
        <span className="ml-2 text-sm text-zinc-500">
          Default: {CADENCE_LABEL[global]}
          {Object.values(overrides).some((c) => c && c !== "default") ? " · some products overridden" : ""}
        </span>
      </summary>

      <div className="border-t border-zinc-100 p-4 sm:p-5">
        <p className="mb-4 text-sm text-zinc-600">
          How often each product&rsquo;s full test suite runs automatically. The scheduler checks this once a day and
          dispatches what&rsquo;s due; you can still run any product on demand above.
        </p>

        <div className="mb-5 flex flex-wrap items-center gap-3">
          <label htmlFor="qa-global" className="text-sm font-semibold text-zinc-800">
            All products (default)
          </label>
          <select
            id="qa-global"
            className={SELECT}
            value={global}
            onChange={(e) => {
              setGlobal(e.target.value as Cadence);
              setMsg(null);
            }}
          >
            {CADENCES.map((c) => (
              <option key={c} value={c}>
                {CADENCE_LABEL[c]}
              </option>
            ))}
          </select>
        </div>

        <div className="divide-y divide-zinc-100 border-y border-zinc-100">
          {products.map((p) => {
            const value = overrides[p.slug] ?? "default";
            return (
              <div key={p.slug} className="flex items-center justify-between gap-3 py-2.5">
                <span className="truncate text-sm text-zinc-800">{p.name}</span>
                <select
                  aria-label={`${p.name} schedule`}
                  className={SELECT}
                  value={value}
                  onChange={(e) => setFor(p.slug, e.target.value as ProductCadence)}
                >
                  <option value="default">Use default ({CADENCE_LABEL[global]})</option>
                  {CADENCES.map((c) => (
                    <option key={c} value={c}>
                      {CADENCE_LABEL[c]}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-[#B8860B] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save schedule"}
          </button>
          {msg && <span className={`text-sm ${msg.ok ? "text-green-700" : "text-red-600"}`}>{msg.text}</span>}
        </div>
      </div>
    </details>
  );
}
