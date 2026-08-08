"use client";

import { useState } from "react";
import Link from "next/link";
import type { SupabaseProjectRow, VercelProjectRow } from "./page";

const PLAN_LIMIT_BYTES = 8 * 1024 ** 3; // Supabase Pro plan: 8 GB included per project

function formatBytes(bytes: number | null): string {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes;
  let i = -1;
  do {
    value /= 1024;
    i++;
  } while (value >= 1024 && i < units.length - 1);
  return `${value.toFixed(value < 10 ? 2 : 1)} ${units[i]}`;
}

function usageLevel(pct: number): { label: string; color: string } {
  if (pct >= 90) return { label: "Critical", color: "text-red-600 bg-red-50" };
  if (pct >= 70) return { label: "Elevated", color: "text-amber-600 bg-amber-50" };
  return { label: "Healthy", color: "text-green-600 bg-green-50" };
}

function barColor(pct: number): string {
  if (pct >= 90) return "bg-red-500";
  if (pct >= 70) return "bg-amber-500";
  return "bg-green-500";
}

type Tab = "all" | "supabase" | "vercel";

export default function OpsDashboard({
  supabaseProjects,
  supabaseError,
  vercelProjects,
  vercelError,
  generatedAt,
}: {
  supabaseProjects: SupabaseProjectRow[];
  supabaseError: string | null;
  vercelProjects: VercelProjectRow[];
  vercelError: string | null;
  generatedAt: string;
}) {
  const [tab, setTab] = useState<Tab>("all");

  const totalBytes = supabaseProjects.reduce((sum, p) => sum + (p.bytes ?? 0), 0);

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <header className="bg-[#1A3A5C] text-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold tracking-tight">Vision Workx</span>
          <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full font-medium">Ops</span>
        </div>
        <Link href="/admin" className="text-xs text-white/70 hover:text-white transition-colors">
          ← Back to Admin
        </Link>
      </header>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[#1A3A5C]">Ops Dashboard</h1>
          <p className="text-gray-500 text-sm mt-1">
            Live infrastructure snapshot across all Revalor apps — Supabase database usage and Vercel
            deployment status, refetched on every page load.
          </p>
        </div>

        <div className="flex gap-1 mb-6 bg-white border border-gray-200 rounded-xl p-1 w-full sm:w-fit overflow-x-auto">
          {(["all", "supabase", "vercel"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 sm:px-5 py-2 rounded-lg text-sm font-medium capitalize transition-colors shrink-0 ${
                tab === t ? "bg-[#1A3A5C] text-white" : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {(tab === "all" || tab === "supabase") && (
          <section className="mb-8">
            <h2 className="text-lg font-semibold text-[#1A3A5C] mb-3">Supabase — Database Usage</h2>
            {supabaseError ? (
              <p className="text-sm text-red-600">Supabase: {supabaseError}</p>
            ) : (
              <>
                <p className="text-xs text-gray-500 mb-3">
                  Combined across all {supabaseProjects.length} projects:{" "}
                  <strong className="text-gray-700">{formatBytes(totalBytes)}</strong> (each project&apos;s Pro
                  plan allowance is its own 8&nbsp;GB — the bar below is per project, not shared)
                </p>
                <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[10px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
                        <th className="px-4 py-2.5 font-semibold">Project</th>
                        <th className="px-4 py-2.5 font-semibold">Region</th>
                        <th className="px-4 py-2.5 font-semibold">Size</th>
                        <th className="px-4 py-2.5 font-semibold">Usage</th>
                        <th className="px-4 py-2.5 font-semibold"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {supabaseProjects.map((p) => {
                        const bytes = p.bytes ?? 0;
                        const pct = (bytes / PLAN_LIMIT_BYTES) * 100;
                        const level = usageLevel(pct);
                        return (
                          <tr key={p.ref} className="border-b border-gray-50 last:border-0">
                            <td className="px-4 py-2.5 font-medium text-gray-800">{p.name}</td>
                            <td className="px-4 py-2.5 text-gray-400">{p.region}</td>
                            <td className="px-4 py-2.5 text-gray-700">{formatBytes(bytes)}</td>
                            <td className="px-4 py-2.5">
                              <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${barColor(pct)}`}
                                  style={{ width: `${Math.min(pct, 100)}%` }}
                                />
                              </div>
                            </td>
                            <td className="px-4 py-2.5">
                              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${level.color}`}>
                                {level.label} · {pct < 0.1 ? "<0.1" : pct.toFixed(1)}%
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        )}

        {(tab === "all" || tab === "vercel") && (
          <section className="mb-8">
            <h2 className="text-lg font-semibold text-[#1A3A5C] mb-3">Vercel — Deployments</h2>
            {vercelError ? (
              <p className="text-sm text-red-600">Vercel: {vercelError}</p>
            ) : (
              <>
                <p className="text-xs text-gray-500 mb-3">
                  Detailed bandwidth/function-invocation usage isn&apos;t exposed via Vercel&apos;s public API —
                  check the{" "}
                  <a
                    href="https://vercel.com/dashboard"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    Vercel dashboard
                  </a>{" "}
                  for that. This lists deployment status per project instead.
                </p>
                <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[10px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
                        <th className="px-4 py-2.5 font-semibold">Project</th>
                        <th className="px-4 py-2.5 font-semibold">Status</th>
                        <th className="px-4 py-2.5 font-semibold">Domain</th>
                        <th className="px-4 py-2.5 font-semibold">Last Deploy</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vercelProjects.map((p) => (
                        <tr key={p.name} className="border-b border-gray-50 last:border-0">
                          <td className="px-4 py-2.5 font-medium text-gray-800">{p.name}</td>
                          <td
                            className={`px-4 py-2.5 font-medium ${
                              p.state === "READY"
                                ? "text-green-600"
                                : p.state === "ERROR"
                                  ? "text-red-600"
                                  : "text-gray-400"
                            }`}
                          >
                            {p.state}
                          </td>
                          <td className="px-4 py-2.5">
                            {p.domain ? (
                              <a
                                href={`https://${p.domain}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:underline"
                              >
                                {p.domain}
                              </a>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-gray-400">
                            {p.deployedAt ? new Date(p.deployedAt).toLocaleString() : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        )}

        <p className="text-xs text-gray-400 mt-4">
          Generated {new Date(generatedAt).toLocaleString()} · reload the page to refresh
        </p>
      </div>
    </div>
  );
}
