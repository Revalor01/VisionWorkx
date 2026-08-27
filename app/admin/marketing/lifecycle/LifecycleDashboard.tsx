"use client";

import { useEffect, useState } from "react";
import type { MarketingAutonomy, MarketingChannel, MarketingProduct } from "@/lib/database.types";

interface TriggerRow {
  id: string;
  name: string;
  description: string;
  products: MarketingProduct[];
  channels: MarketingChannel[];
  active: boolean;
  autonomy: MarketingAutonomy;
  recentFireCount: number;
}

export default function LifecycleDashboard() {
  const [triggers, setTriggers] = useState<TriggerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/marketing/lifecycle");
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setTriggers(body.triggers);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function update(id: string, patch: { active?: boolean; autonomy?: MarketingAutonomy }) {
    setBusyIds((prev) => new Set(prev).add(id));
    setError("");
    try {
      const res = await fetch(`/api/admin/marketing/lifecycle/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="bg-[#1A3A5C] text-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold tracking-tight">Revalor</span>
          <span className="text-xs bg-black/20 px-2 py-0.5 rounded-full font-medium">Lifecycle Triggers</span>
        </div>
        <a href="/admin/marketing" className="text-xs text-white/70 hover:text-white transition-colors">
          ← Email Marketing
        </a>
      </header>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <h1 className="text-2xl font-bold text-white mb-1">Lifecycle Triggers</h1>
        <p className="text-slate-400 text-sm mb-8">
          Event-driven email based on account activity, evaluated hourly. Generated drafts land in Email
          Marketing&apos;s pending review queue when autonomy is manual.
        </p>

        {error && <div className="mb-4 p-2 rounded-lg bg-red-900/40 border border-red-700 text-red-300 text-sm">{error}</div>}

        {loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : (
          <div className="bg-[#0d0d0d] rounded-2xl border border-green-600 divide-y divide-slate-800 overflow-hidden">
            {triggers.map((t) => (
              <div key={t.id} className="px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <p className="text-sm font-medium text-white">{t.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{t.description}</p>
                  <p className="text-xs text-slate-600 mt-1">
                    {t.products.join(", ")} · {t.channels.join("/")} · {t.recentFireCount} fired in the last 30 days
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <select
                    value={t.autonomy}
                    onChange={(e) => update(t.id, { autonomy: e.target.value as MarketingAutonomy })}
                    disabled={busyIds.has(t.id)}
                    className="bg-black border border-slate-700 rounded-lg px-2 py-1.5 text-xs"
                  >
                    <option value="manual">Manual</option>
                    <option value="auto">Auto</option>
                  </select>
                  <button
                    onClick={() => update(t.id, { active: !t.active })}
                    disabled={busyIds.has(t.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50 ${t.active ? "bg-green-700 text-white" : "bg-slate-800 text-slate-400"}`}
                  >
                    {t.active ? "On" : "Off"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
