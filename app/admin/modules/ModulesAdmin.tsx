"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { embedSnippet } from "@/lib/modules/install";
import { MODULE_TYPES } from "@/lib/modules/constants";
import type { ModuleCostEstimate, ModuleTypeCounts } from "@/lib/modules/moduleStats";
import { AdminHeader, AdminProductPills } from "../AdminNavHeader";

export interface AdminWorkspace {
  id: string; name: string; slug: string; domains: string[]; plan: string; created_at: string;
  modules: { id: string; public_id: string; type: string; name: string; status: string }[];
  memberCount: number; submissions30d: number;
}

export interface ModulesAdminStats {
  businessCount: number;
  liveModuleCount: number;
  modulesByType: ModuleTypeCounts;
  cost: ModuleCostEstimate;
}

const MODULE_TYPE_LABELS: Record<string, string> = {
  lead_capture: "Lead capture",
  booking: "Booking",
  quote_calculator: "Quote calculator",
  intake_form: "Intake form",
};

function formatUsd(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

async function call(body: Record<string, unknown>) {
  const res = await fetch("/api/admin/modules", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

const input = "rounded-lg border border-gray-300 px-3 py-2 text-sm";

export default function ModulesAdmin({ initial, stats }: { initial: AdminWorkspace[]; stats: ModulesAdminStats }) {
  const router = useRouter();
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(body: Record<string, unknown>, ok: string) {
    setBusy(true);
    setMsg("");
    try {
      await call(body);
      setMsg(ok);
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <AdminHeader badge="Modules" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-8">
        <AdminProductPills />
      </div>
      <main className="mx-auto max-w-5xl space-y-8 p-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">Operator</p>
        <h1 className="text-2xl font-bold text-navy-dark">VisionWorkx modules — client workspaces</h1>
      </div>
      {msg && <p role="status" className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800">{msg}</p>}

      <ModuleStatsSection stats={stats} />

      <form
        className="grid gap-3 rounded-2xl border border-gray-200 bg-white p-5 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          run(
            { action: "create_workspace", name: f.get("name"), slug: f.get("slug"), notification_email: f.get("email"), domains: String(f.get("domains") ?? "").split(/[\s,]+/) },
            "Workspace created.",
          );
        }}
      >
        <h2 className="font-bold sm:col-span-2">New client workspace</h2>
        <label className="text-sm font-medium">Business name<input name="name" required className={`${input} mt-1 w-full`} /></label>
        <label className="text-sm font-medium">Slug (URL)<input name="slug" required pattern="[a-z0-9][a-z0-9-]{1,46}[a-z0-9]" className={`${input} mt-1 w-full`} placeholder="harbor-plumbing" /></label>
        <label className="text-sm font-medium">Alert email<input name="email" type="email" className={`${input} mt-1 w-full`} /></label>
        <label className="text-sm font-medium">Website domains<input name="domains" className={`${input} mt-1 w-full`} placeholder="example.com www.example.com" /></label>
        <button disabled={busy} className="rounded-lg bg-navy-dark px-4 py-2 text-sm font-semibold text-white sm:col-span-2 sm:justify-self-start">Create workspace</button>
      </form>

      {initial.map((w) => (
        <section key={w.id} className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-bold">{w.name} <span className="text-sm font-normal text-gray-500">/{w.slug} · {w.plan}</span></h2>
            <span className="text-sm text-gray-500">{w.memberCount} logins · {w.submissions30d} submissions (30d)</span>
          </div>
          <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); run({ action: "update_domains", workspace_id: w.id, domains: String(f.get("domains") ?? "").split(/[\s,]+/) }, "Domains saved."); }}>
            <input name="domains" defaultValue={w.domains.join(" ")} className={`${input} min-w-0 flex-1`} aria-label="Domains" />
            <button disabled={busy} className="rounded-lg border px-3 py-2 text-sm">Save domains</button>
          </form>
          <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); run({ action: "invite_member", workspace_id: w.id, email: f.get("email"), role: f.get("role") }, "Invite sent."); }}>
            <input name="email" type="email" required placeholder="owner@client.com" className={`${input} min-w-0 flex-1`} aria-label="Invite email" />
            <select name="role" className={input} aria-label="Role"><option value="owner">Owner</option><option value="staff">Staff</option></select>
            <button disabled={busy} className="rounded-lg border px-3 py-2 text-sm">Invite login</button>
          </form>
          <div className="space-y-2">
            {w.modules.map((m) => (
              <div key={m.id} className="rounded-xl border border-gray-100 p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span><strong>{m.name}</strong> · {m.type} · <em>{m.status}</em></span>
                  <select defaultValue={m.status} disabled={busy} aria-label="Module status" className={input}
                    onChange={(e) => run({ action: "set_module_status", public_id: m.public_id, status: e.target.value }, "Status updated.")}>
                    <option value="draft">draft</option><option value="live">live</option><option value="paused">paused</option>
                  </select>
                </div>
                <code className="mt-2 block break-all rounded bg-gray-50 p-2 text-xs">{embedSnippet(m.public_id)}</code>
              </div>
            ))}
            <button disabled={busy} className="rounded-lg border px-3 py-2 text-sm" onClick={() => run({ action: "create_module", workspace_id: w.id, type: "lead_capture", name: "Lead capture form" }, "Module created (draft).")}>
              + Add lead capture module
            </button>
          </div>
        </section>
      ))}
      </main>
    </div>
  );
}

// Vertical bar chart, single hue (one series -> no legend needed, the
// section title already names what's plotted). Bars <=24px thick, 4px
// rounded caps, grow from a shared hairline baseline, value labeled at the
// cap, category labeled below the baseline.
const CHART_HEIGHT_PX = 140;
const BAR_WIDTH_PX = 24;
const BAR_SLOT_PX = 72;

function ModuleTypeBarChart({ counts }: { counts: ModuleTypeCounts }) {
  const entries = MODULE_TYPES.map((t) => [t, counts[t]] as const);
  const max = Math.max(1, ...entries.map(([, v]) => v));
  const total = entries.reduce((sum, [, v]) => sum + v, 0);

  if (total === 0) {
    return <div className="text-sm text-gray-400">No modules created yet.</div>;
  }

  return (
    <div className="overflow-x-auto">
      <div className="flex items-end gap-2" style={{ height: CHART_HEIGHT_PX + 28 }}>
        {entries.map(([type, count]) => (
          <div key={type} className="flex shrink-0 flex-col items-center justify-end" style={{ width: BAR_SLOT_PX }}>
            <div className="mb-1 text-sm font-semibold text-navy-dark">{count}</div>
            <div
              title={`${MODULE_TYPE_LABELS[type] ?? type}: ${count}`}
              className="rounded-t-[4px] bg-navy"
              style={{ width: BAR_WIDTH_PX, height: Math.max(4, Math.round((count / max) * CHART_HEIGHT_PX)) }}
            />
          </div>
        ))}
      </div>
      <div className="border-t border-gray-300" />
      <div className="mt-2 flex gap-2">
        {entries.map(([type]) => (
          <div key={type} className="shrink-0 text-center text-[11px] leading-tight text-gray-500" style={{ width: BAR_SLOT_PX }}>
            {MODULE_TYPE_LABELS[type] ?? type}
          </div>
        ))}
      </div>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-navy-dark">{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-gray-400">{sub}</div>}
    </div>
  );
}

function ModuleStatsSection({ stats }: { stats: ModulesAdminStats }) {
  const totalModules = MODULE_TYPES.reduce((sum, t) => sum + stats.modulesByType[t], 0);

  return (
    <section className="space-y-4">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Businesses" value={String(stats.businessCount)} />
        <StatCard label="Modules created" value={String(totalModules)} />
        <StatCard label="Modules live" value={String(stats.liveModuleCount)} />
        <StatCard
          label="Est. AI cost / module"
          value={formatUsd(stats.cost.avgCostPerModuleUsd)}
          sub={`${formatUsd(stats.cost.totalCostUsd)} total · ${stats.cost.measuredDrafts} drafts`}
        />
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5">
        <div className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">Modules Sold</div>
        <p className="mb-4 text-xs text-gray-400">Every module ever created, by type, across all client workspaces.</p>
        <ModuleTypeBarChart counts={stats.modulesByType} />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white p-5">
        <div className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">
          Est. AI cost per module type
        </div>
        <p className="mb-3 text-xs text-gray-400">
          AI drafting cost (source <code>module_config</code>) has no per-module attribution, so every type is
          priced at the same measured average — {formatUsd(stats.cost.avgCostPerModuleUsd)} today. Not a real
          per-type cost, just that average applied to each type&apos;s count.
        </p>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-[10px] uppercase tracking-wide text-gray-400">
              <th className="py-2 font-semibold">Module</th>
              <th className="py-2 font-semibold">Created</th>
              <th className="py-2 font-semibold">Est. cost each</th>
              <th className="py-2 font-semibold">Est. total</th>
            </tr>
          </thead>
          <tbody>
            {MODULE_TYPES.map((type) => {
              const count = stats.modulesByType[type];
              return (
                <tr key={type} className="border-b border-gray-100 last:border-0">
                  <td className="py-2 font-medium text-gray-900">{MODULE_TYPE_LABELS[type] ?? type}</td>
                  <td className="py-2 text-gray-500">{count}</td>
                  <td className="py-2 text-gray-500">{formatUsd(stats.cost.avgCostPerModuleUsd)}</td>
                  <td className="py-2 font-medium text-gray-900">{formatUsd(stats.cost.avgCostPerModuleUsd * count)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
