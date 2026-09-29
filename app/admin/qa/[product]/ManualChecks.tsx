"use client";

import { useState } from "react";

type Status = "passed" | "failed" | "skipped";

export interface ManualCheck {
  id: string;
  area: string;
  title: string;
  instructions: string;
  last: { status: Status; note: string | null; created_at: string } | null;
}

const PILL: Record<Status, string> = {
  passed: "bg-emerald-100 text-emerald-800",
  failed: "bg-red-100 text-red-800",
  skipped: "bg-zinc-200 text-zinc-600",
};

export default function ManualChecks({ checks }: { checks: ManualCheck[] }) {
  const [state, setState] = useState(checks);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function record(id: string, status: Status) {
    setBusy(id);
    setError("");
    try {
      const res = await fetch("/api/admin/qa/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testId: id, status, note: notes[id] ?? "" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Couldn't save.");
        return;
      }
      setState((prev) => prev.map((c) => (c.id === id ? { ...c, last: data.check } : c)));
      setNotes((n) => ({ ...n, [id]: "" }));
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(null);
    }
  }

  if (state.length === 0) return null;
  return (
    <section className="mb-8 rounded-xl border-2 border-[#B8860B] bg-white p-4 sm:p-5">
      <h2 className="text-lg font-bold text-zinc-900">Manual checks</h2>
      <p className="mb-3 text-sm text-zinc-500">Things a robot can&apos;t do (real inboxes, Google&apos;s and Stripe&apos;s own screens). Record the result when you&apos;ve checked.</p>
      {error && (
        <p role="alert" className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <ul className="space-y-3">
        {state.map((c) => (
          <li key={c.id} className="rounded-2xl border border-zinc-200 bg-white p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs uppercase text-zinc-400">{c.area}</span>
              <span className="font-medium text-zinc-900">{c.title}</span>
              {c.last ? (
                <span className={`ml-auto rounded-full px-2 py-0.5 text-xs font-semibold ${PILL[c.last.status]}`}>
                  {c.last.status} · {new Date(c.last.created_at).toLocaleDateString()}
                </span>
              ) : (
                <span className="ml-auto rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500">never checked</span>
              )}
            </div>
            <p className="mt-2 text-sm text-zinc-600">{c.instructions}</p>
            {c.last?.note && <p className="mt-1 text-xs text-zinc-500">Last note: {c.last.note}</p>}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <label className="sr-only" htmlFor={`note-${c.id}`}>
                Note for {c.title}
              </label>
              <input
                id={`note-${c.id}`}
                value={notes[c.id] ?? ""}
                onChange={(e) => setNotes((n) => ({ ...n, [c.id]: e.target.value }))}
                placeholder="Note (optional)"
                className="min-w-[14rem] flex-1 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm"
              />
              <button type="button" disabled={busy === c.id} onClick={() => record(c.id, "passed")} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
                Passed
              </button>
              <button type="button" disabled={busy === c.id} onClick={() => record(c.id, "failed")} className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
                Failed
              </button>
              <button type="button" disabled={busy === c.id} onClick={() => record(c.id, "skipped")} className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 disabled:opacity-50">
                Skip
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
