import type { ReactNode } from "react";
import { AdminHeader } from "../AdminNavHeader";
import AdminNavBar from "../AdminNavBar";
import type { ResultStatus, RunStatus } from "@/lib/qa/db";

// Shared bits for the /admin/qa pages (server components).

export function QaShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-50">
      <AdminHeader badge="QA" />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <AdminNavBar category="operations" current="qa" />
        {children}
      </main>
    </div>
  );
}

const STATUS_STYLE: Record<RunStatus | ResultStatus | "stale" | "never", string> = {
  passed: "bg-emerald-100 text-emerald-800",
  flaky: "bg-amber-100 text-amber-800",
  failed: "bg-red-100 text-red-800",
  timed_out: "bg-red-100 text-red-800",
  error: "bg-red-100 text-red-800",
  running: "bg-blue-100 text-blue-800",
  queued: "bg-zinc-200 text-zinc-700",
  skipped: "bg-zinc-200 text-zinc-600",
  cancelled: "bg-zinc-200 text-zinc-600",
  stale: "bg-amber-100 text-amber-800",
  never: "bg-zinc-100 text-zinc-500",
};

const STATUS_LABEL: Partial<Record<keyof typeof STATUS_STYLE, string>> = {
  timed_out: "timed out",
  stale: "didn't start",
  never: "not run",
};

export function StatusBadge({ status }: { status: keyof typeof STATUS_STYLE }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[status]}`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

export function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function duration(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

export function NotConfigured({ what }: { what: string }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      {what} — apply <code>supabase/migrations/20240101000092_vw_qa.sql</code> to the main VisionWorkx project (see{" "}
      <code>docs/qa-suite.md</code>).
    </div>
  );
}
