"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { AppRevisionKind, AppRevisionStatus, AppStatus } from "@/lib/database.types";

export interface RevisionRow {
  id: string;
  kind: AppRevisionKind;
  status: AppRevisionStatus;
  request_text: string | null;
  changelog: string | null;
  changed_files: string[];
  error: string | null;
  created_at: string;
  deployed_at: string | null;
}

interface Quota {
  used: number;
  limit: number;
}

const STATUS_STYLE: Record<AppRevisionStatus, { label: string; cls: string; dot: string }> = {
  queued: { label: "Queued", cls: "bg-gray-100 text-gray-600", dot: "bg-gray-400" },
  building: { label: "Building", cls: "bg-blue-100 text-blue-700", dot: "bg-blue-500 animate-pulse" },
  deployed: { label: "Live", cls: "bg-green-100 text-green-700", dot: "bg-green-500" },
  failed: { label: "Didn't apply", cls: "bg-red-100 text-red-700", dot: "bg-red-500" },
};

function timeAgo(iso: string): string {
  const secs = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

function revisionTitle(r: RevisionRow): string {
  if (r.kind === "create") return "Initial build";
  if (r.kind === "rollback") return r.changelog ?? "Rolled back";
  return r.request_text ?? "Change request";
}

export default function RequestChangePanel({
  appId,
  appStatus,
  initialRevisions,
  initialQuota,
}: {
  appId: string;
  appStatus: AppStatus;
  initialRevisions: RevisionRow[];
  initialQuota: Quota;
}) {
  const router = useRouter();
  const [revisions, setRevisions] = useState<RevisionRow[]>(initialRevisions);
  const [quota, setQuota] = useState<Quota>(initialQuota);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [rollingBack, setRollingBack] = useState(false);
  const [error, setError] = useState("");
  const lastPending = useRef(false);

  const pending = revisions.some((r) => r.status === "queued" || r.status === "building");
  const quotaSpent = quota.used >= quota.limit;
  const appBusy = appStatus !== "deployed";

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/apps/${appId}/revisions`);
      if (!res.ok) return;
      const data = await res.json();
      setRevisions(data.revisions ?? []);
      if (data.quota) setQuota(data.quota);
    } catch {
      /* transient — next tick retries */
    }
  }, [appId]);

  // Poll while anything is in flight; when the last in-flight revision
  // finishes, pull fresh server state (new deploy_url / status).
  useEffect(() => {
    if (!pending) {
      if (lastPending.current) router.refresh();
      lastPending.current = false;
      return;
    }
    lastPending.current = true;
    const id = setInterval(refresh, 4000);
    return () => clearInterval(id);
  }, [pending, refresh, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const requestText = text.trim();
    if (!requestText || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`/api/apps/${appId}/revisions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestText }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't queue that change.");
        if (data.quota) setQuota(data.quota);
        return;
      }
      setRevisions((prev) => [data.revision, ...prev]);
      if (data.quota) setQuota(data.quota);
      setText("");
    } catch {
      setError("Network error — try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function undo(revisionId: string) {
    if (rollingBack) return;
    setRollingBack(true);
    setError("");
    try {
      const res = await fetch(`/api/apps/${appId}/revisions/${revisionId}/rollback`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Couldn't undo that change.");
        return;
      }
      await refresh();
    } catch {
      setError("Network error — try again.");
    } finally {
      setRollingBack(false);
    }
  }

  const latest = revisions[0];
  const canUndoLatest =
    latest && latest.status === "deployed" && latest.kind !== "create" && !pending && !appBusy;

  return (
    <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
      <div className="flex items-baseline justify-between mb-1">
        <h2 className="font-semibold text-navy-dark">Request a change</h2>
        <span className="text-xs text-gray-400 tabular-nums">
          {quota.used} / {quota.limit} this month
        </span>
      </div>
      <p className="text-gray-500 text-sm mb-4">
        Describe what you want changed in plain English. We edit your app and redeploy it — your
        live link stays up the whole time.
      </p>

      <form onSubmit={submit}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          maxLength={2000}
          disabled={submitting || pending || quotaSpent || appBusy}
          placeholder="e.g. Add a phone number field to the booking form, and show it on the confirmation page."
          className="w-full rounded-xl border border-gray-300 p-3 text-sm text-navy-dark placeholder:text-gray-400 focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy disabled:bg-gray-50 disabled:text-gray-400"
        />
        <div className="mt-3 flex items-center gap-3">
          <button
            type="submit"
            disabled={!text.trim() || submitting || pending || quotaSpent || appBusy}
            className="bg-navy-dark text-white font-semibold px-5 py-2.5 rounded-xl hover:bg-navy transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? "Sending…" : "Request this change"}
          </button>
          {pending && <span className="text-sm text-blue-600">A change is being applied…</span>}
          {!pending && quotaSpent && (
            <span className="text-sm text-gray-500">
              You&apos;ve used all your change requests this month.
            </span>
          )}
          {!pending && appBusy && !quotaSpent && (
            <span className="text-sm text-gray-500">Wait for the current deploy to finish.</span>
          )}
        </div>
      </form>

      {error && (
        <div className="mt-3 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}

      {canUndoLatest && (
        <button
          onClick={() => undo(latest.id)}
          disabled={rollingBack}
          className="mt-4 text-sm text-navy hover:underline disabled:opacity-40"
        >
          {rollingBack ? "Undoing…" : "↩ Undo the last change"}
        </button>
      )}

      {revisions.length > 0 && (
        <ol className="mt-6 space-y-3 border-t border-gray-100 pt-5">
          {revisions.map((r) => {
            const s = STATUS_STYLE[r.status];
            return (
              <li key={r.id} className="flex gap-3 text-sm">
                <span
                  className={`mt-0.5 h-2 w-2 flex-none rounded-full ${s.dot}`}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-navy-dark">{revisionTitle(r)}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.cls}`}>
                      {s.label}
                    </span>
                    <span className="text-xs text-gray-400">{timeAgo(r.created_at)}</span>
                  </div>
                  {r.status === "deployed" && r.changelog && r.kind === "change" && (
                    <p className="text-gray-500 mt-0.5">{r.changelog}</p>
                  )}
                  {r.status === "failed" && r.error && (
                    <p className="text-red-600 mt-0.5">{r.error}</p>
                  )}
                  {r.status === "deployed" && r.changed_files.length > 0 && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      {r.changed_files.length} file{r.changed_files.length === 1 ? "" : "s"} changed
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
