"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AdminHeader } from "../AdminNavHeader";
import AdminNavBar from "../AdminNavBar";
import { money } from "@/lib/needsAnalyzer/format";
import type { Catalog } from "@/lib/needsAnalyzer/types";

// Shared frame for the /admin/needs-analyzer screens: header, the analyzer's own
// nav, Client mode, and a small toast. Client mode hides everything internal
// (notes, pricing settings, ecosystem, the admin header) while the client is
// looking at the screen; it's remembered per browser.

const CM_KEY = "na-client-mode";
const ClientModeCtx = createContext<{ on: boolean; set: (v: boolean) => void }>({ on: false, set: () => {} });
export const useClientMode = () => useContext(ClientModeCtx);

const ToastCtx = createContext<(msg: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export type NavItem = { key: string; label: string; href?: string; onClick?: () => void; internal?: boolean };

export function NaShell({ active, items = [], children }: { active: string; items?: NavItem[]; children: ReactNode }) {
  const [on, setOn] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    try {
      // Read once after mount (localStorage isn't available during server render).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOn(localStorage.getItem(CM_KEY) === "1");
    } catch {}
  }, []);
  const set = useCallback((v: boolean) => {
    setOn(v);
    try {
      localStorage.setItem(CM_KEY, v ? "1" : "0");
    } catch {}
  }, []);
  const show = useCallback((msg: string) => {
    setToast(msg);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 2200);
  }, []);

  const nav: NavItem[] = [
    { key: "home", label: "Assessments", href: "/admin/needs-analyzer" },
    ...items,
    { key: "website", label: "Website check", href: "/admin/needs-analyzer/website", internal: true },
    { key: "ecosystem", label: "Ecosystem", href: "/admin/needs-analyzer/ecosystem", internal: true },
    { key: "catalog", label: "Catalog & pricing", href: "/admin/needs-analyzer/catalog", internal: true },
  ].filter((n) => !(on && n.internal));

  return (
    <ClientModeCtx.Provider value={{ on, set }}>
      <ToastCtx.Provider value={show}>
        <div className="min-h-screen bg-zinc-50 print:bg-white">
          {!on && (
            <div className="print:hidden">
              <AdminHeader title="Revalor Needs Analyzer" badge="Sales" />
            </div>
          )}
          <main className="mx-auto max-w-admin px-4 py-6 sm:px-6 lg:px-10 print:p-0">
            {!on && (
              <div className="mb-4 print:hidden">
                <AdminNavBar category="operations" current="needs-analyzer" />
              </div>
            )}
            <div className="mb-6 flex flex-wrap items-center gap-2 print:hidden">
              {nav.map((n) => {
                const cls = `rounded-lg px-3 py-1.5 text-sm font-medium ${n.key === active ? "bg-[#1A3A5C] text-white" : "border border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400"}`;
                return n.href ? (
                  <Link key={n.key} href={n.href} className={cls}>
                    {n.label}
                  </Link>
                ) : (
                  <button key={n.key} type="button" onClick={n.onClick} className={cls}>
                    {n.label}
                  </button>
                );
              })}
              <label className="ml-auto flex cursor-pointer items-center gap-2 text-sm text-zinc-700" title="Hides internal screens while the client is looking">
                <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} className="h-4 w-4" />
                Client mode
              </label>
            </div>
            {children}
          </main>
          {toast && (
            <div role="status" className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-zinc-900 px-4 py-2 text-sm text-white shadow-lg print:hidden">
              {toast}
            </div>
          )}
        </div>
      </ToastCtx.Provider>
    </ClientModeCtx.Provider>
  );
}

export const CARD = "mb-6 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm";
export const INPUT = "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-100";
export const NUM = "w-24 rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm focus:border-teal-600 focus:outline-none";
export const BTN = "rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:border-zinc-400 disabled:opacity-50";
export const BTN_PRIMARY = "rounded-md bg-teal-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50";
export const BTN_DANGER = "rounded-md border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50";

export const CAT_STYLE: Record<string, string> = {
  VisionWorkx: "bg-blue-50 text-blue-700",
  Automation: "bg-purple-50 text-purple-700",
  "Revalor Product": "bg-amber-50 text-amber-800",
  "Custom Build": "bg-teal-50 text-teal-700",
  Service: "bg-slate-100 text-slate-600",
};

export type Tone = "ok" | "warn" | "bad" | "accent" | "plain";
const TONE: Record<Tone, string> = {
  ok: "bg-emerald-50 text-emerald-700",
  warn: "bg-amber-50 text-amber-700",
  bad: "bg-red-50 text-red-700",
  accent: "bg-teal-50 text-teal-700",
  plain: "bg-zinc-100 text-zinc-600",
};

export function Badge({ tone = "plain", className = "", title, children }: { tone?: Tone; className?: string; title?: string; children: ReactNode }) {
  return (
    <span title={title} className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${className || TONE[tone]}`}>
      {children}
    </span>
  );
}

export function Stat({ label, value, sub, valueClass = "" }: { label: string; value: ReactNode; sub?: ReactNode; valueClass?: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold text-zinc-900 ${valueClass}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-zinc-500">{sub}</div>}
    </div>
  );
}

export const statusTone = (s: string): Tone => (s === "Won" ? "ok" : s === "Lost" ? "bad" : s === "Proposal sent" ? "accent" : "plain");

export async function api<T = unknown>(method: string, url: string, body?: unknown): Promise<T> {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error || r.statusText);
  return r.json() as Promise<T>;
}

export function download(name: string, text: string, type: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export const csvCell = (v: unknown) => {
  const s = Array.isArray(v) ? v.join("; ") : String(v ?? "");
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/** Saves `value` with `save` half a second after the last change (and on leaving). */
export function useDebouncedSave<T>(save: (v: T) => Promise<void>, delay = 500) {
  const pending = useRef<{ v: T } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });
  const flush = useCallback(() => {
    clearTimeout(timer.current);
    const p = pending.current;
    pending.current = null;
    if (p) void saveRef.current(p.v);
  }, []);
  const schedule = useCallback(
    (v: T) => {
      pending.current = { v };
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, delay);
    },
    [delay, flush],
  );
  useEffect(() => {
    const onHide = () => flush();
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      flush();
    };
  }, [flush]);
  return { schedule, flush };
}

export function moneyFmt(catalog: Catalog) {
  return (n: number) => money(catalog.settings?.currency, n);
}
