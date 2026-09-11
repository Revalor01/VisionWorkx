"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import AppNavbar from "@/components/nav/AppNavbar";
import { createBrowserClient } from "@/lib/supabase-browser";
import {
  BUILD_PHASES,
  clientBuildState,
  type StreamPhase,
} from "@/lib/apps/clientStatus";

export default function GenerateClient({
  userName,
  userEmail,
  plan,
}: {
  userName: string | null;
  userEmail?: string | null;
  plan: import("@/lib/database.types").Plan;
}) {
  const searchParams = useSearchParams();
  const appId = searchParams.get("appId");

  // The two inputs to the customer-facing view: a live stream phase hint
  // (while /api/generate is streaming) and the DB status (after, via polling).
  const [streamPhase, setStreamPhase] = useState<StreamPhase | null>(null);
  const [dbStatus, setDbStatus] = useState<string | null>(null);
  const [deployUrl, setDeployUrl] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeAt, setNoticeAt] = useState<string | null>(null);
  const [longRunning, setLongRunning] = useState(false);
  // A gentle crawl within the current phase so the bar is never frozen — it's
  // reset whenever the phase advances.
  const [drift, setDrift] = useState(0);

  const abortRef = useRef<AbortController | null>(null);
  const hasStarted = useRef(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const view = clientBuildState(dbStatus, { streamPhase, notice, noticeAt });

  useEffect(() => {
    setDrift(0);
    if (view.done) return;
    const t = setInterval(() => setDrift((d) => Math.min(d + 0.5, 16)), 2500);
    return () => clearInterval(t);
  }, [view.phase, view.done]);

  // Poll the app row after the generate stream closes; `status` is the source
  // of truth. Uses the session-authenticated client (an anon read is blocked
  // by RLS on `apps`).
  const startPolling = useCallback((id: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    const supabase = createBrowserClient();
    let attempts = 0;

    pollRef.current = setInterval(async () => {
      attempts += 1;
      try {
        const { data: row } = await supabase
          .from("apps")
          .select("status, deploy_url, build_notice, build_notice_at")
          .eq("id", id)
          .maybeSingle();

        if (row?.status) {
          setDbStatus(row.status);
          setStreamPhase(null);
        }
        setNotice(row?.build_notice ?? null);
        setNoticeAt(row?.build_notice_at ?? null);

        if (row?.status === "deployed") {
          setDeployUrl(row.deploy_url ?? null);
          clearInterval(pollRef.current!);
          pollRef.current = null;
          return;
        }
        // failed / deploy_failed is NOT surfaced as a failure — clientBuildState()
        // renders "We've run into an issue" + the build_notice update panel. We
        // keep polling either way so an operator's follow-up update (and an
        // eventual successful deploy) appear on this screen without a refresh.

        // Long tail: after ~45 min stop polling. The update panel and the
        // email carry it from here.
        if (attempts >= 450) {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          setLongRunning(true);
        }
      } catch {
        // ignore transient network errors — keep polling
      }
    }, 6000);
  }, []);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const startGeneration = useCallback(
    async (id: string) => {
      abortRef.current = new AbortController();
      setStreamPhase("designing");
      setDbStatus(null);
      setDeployUrl(null);
      setLongRunning(false);

      try {
        const response = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ appId: id }),
          signal: abortRef.current.signal,
        });

        if (!response.ok || !response.body) {
          // The stream never opened — go straight to polling; the server may
          // still finish, and if not, the operator is alerted.
          startPolling(id);
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          // Parse whole lines; keep any trailing partial line in `buf`.
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) {
            const m = line.match(/^\[\[PHASE:(designing|building|reviewing)\]\]$/);
            if (m) setStreamPhase(m[1] as StreamPhase);
            // [[TICK]] and anything else are ignored.
          }
        }

        // Stream closed — code saved server-side, deploy pipeline fired.
        setStreamPhase(null);
        setDbStatus("ready");
        startPolling(id);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        console.error("[generate client]", err);
        // A drop mid-stream — the server may still be finishing. Poll for the
        // real outcome rather than declaring anything failed.
        setStreamPhase(null);
        startPolling(id);
      }
    },
    [startPolling],
  );

  useEffect(() => {
    if (!appId || hasStarted.current) return;
    hasStarted.current = true;

    // A page refresh remounts this component. Never kick off a SECOND
    // generation on an app that's already built or building.
    (async () => {
      try {
        const supabase = createBrowserClient();
        const { data: row } = await supabase
          .from("apps")
          .select("status, deploy_url, build_notice, build_notice_at")
          .eq("id", appId)
          .maybeSingle();
        setNotice(row?.build_notice ?? null);
        setNoticeAt(row?.build_notice_at ?? null);
        if (row?.status === "deployed") {
          setDbStatus("deployed");
          setDeployUrl(row.deploy_url ?? null);
          return;
        }
        if (
          row?.status === "deploying" ||
          row?.status === "ready" ||
          row?.status === "failed" ||
          row?.status === "deploy_failed"
        ) {
          setDbStatus(row.status);
          startPolling(appId);
          return;
        }
      } catch {
        /* fall through to a fresh generation */
      }
      startGeneration(appId);
    })();

    return () => {
      abortRef.current?.abort();
    };
  }, [appId, startGeneration, startPolling]);

  if (!appId) {
    return (
      <div className="min-h-screen bg-off-white flex flex-col">
        <AppNavbar userName={userName} plan={plan} userEmail={userEmail} />
        <main className="flex-1 flex items-center justify-center px-4">
          <div className="text-center max-w-md">
            <div className="text-5xl mb-4">⚠️</div>
            <h1 className="text-xl font-bold text-navy-dark mb-2">Missing app ID</h1>
            <p className="text-gray-500 text-sm mb-6">
              This page requires an app ID. Go back to your dashboard and try
              creating a new app.
            </p>
            <Link
              href="/dashboard"
              className="inline-block bg-navy-dark text-white font-semibold px-6 py-3 rounded-xl hover:bg-navy transition-colors"
            >
              Go to Dashboard
            </Link>
          </div>
        </main>
      </div>
    );
  }

  // phaseBase = start of the current phase's slice; + drift, capped just shy
  // of the next phase so an advance always feels like forward motion.
  const phaseBase = ((view.phase - 1) / BUILD_PHASES.length) * 100;
  const phaseCeil = (view.phase / BUILD_PHASES.length) * 100 - 2;
  const pct = view.done ? 100 : Math.round(Math.min(phaseBase + drift, phaseCeil));

  const fmtWhen = (iso: string | null) => {
    if (!iso) return "";
    const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.round(mins / 60);
    return hrs < 24 ? `${hrs} hr ago` : new Date(iso).toLocaleString();
  };

  return (
    <div className="min-h-screen bg-off-white flex flex-col">
      <AppNavbar userName={userName} plan={plan} />

      <main className="flex-1 max-w-xl mx-auto w-full px-4 py-14">
        {/* Headline */}
        <div className="text-center mb-10">
          <div className="flex items-center justify-center gap-2 mb-3">
            {view.done ? (
              <span className="text-green-500 text-lg">✓</span>
            ) : view.settling ? (
              <span className="text-amber-500 text-lg">!</span>
            ) : (
              <span className="inline-block w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            )}
            <h1 className="text-2xl font-bold text-navy-dark">{view.headline}</h1>
          </div>
          <p className="text-gray-500 text-sm max-w-md mx-auto">{view.sub}</p>
        </div>

        {/* Progress bar */}
        <div className="mb-8">
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all duration-1000 ${
                view.done ? "bg-green-500" : view.settling ? "bg-amber-400" : "bg-navy-dark"
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Phase steps */}
        <div className="space-y-2.5 mb-8">
          {BUILD_PHASES.map(({ n, label }) => {
            const isDone = view.done ? true : n < view.phase;
            const isActive = !view.done && n === view.phase;
            const attention = isActive && view.settling;
            return (
              <div
                key={n}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm border ${
                  isDone
                    ? "bg-green-50 border-green-200 text-green-700"
                    : attention
                      ? "bg-amber-50 border-amber-300 text-amber-800"
                      : isActive
                        ? "bg-blue-50 border-navy text-navy-dark"
                        : "bg-white border-gray-200 text-gray-400"
                }`}
              >
                <span className="shrink-0 w-4 text-center">
                  {isDone ? "✓" : attention ? "!" : isActive ? "⚙" : "○"}
                </span>
                <span className="font-medium">{label}</span>
                {isActive && !attention && (
                  <span className="ml-auto text-xs animate-pulse">…</span>
                )}
              </div>
            );
          })}
        </div>

        {/* Update panel — shown when a build has hit an issue */}
        {view.settling && view.notice && (
          <div className="border border-amber-200 bg-amber-50 rounded-2xl p-5 mb-8">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                Latest update
              </span>
              {view.noticeAt && (
                <span className="text-xs text-amber-600">{fmtWhen(view.noticeAt)}</span>
              )}
            </div>
            <p className="text-sm text-amber-900 leading-relaxed">{view.notice}</p>
          </div>
        )}

        {/* Done */}
        {view.done && (
          <div className="text-center space-y-4">
            {deployUrl && (
              <a
                href={deployUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-block bg-green-600 text-white font-semibold px-10 py-3.5 rounded-xl text-base hover:bg-green-700 transition-colors"
              >
                Open Your Live App →
              </a>
            )}
            <div>
              <Link
                href="/dashboard"
                className="inline-block text-navy-dark font-medium underline text-sm hover:text-navy transition-colors"
              >
                View Your App in Dashboard
              </Link>
            </div>
          </div>
        )}

        {/* In progress footer */}
        {!view.done && (
          <div className="text-center space-y-3">
            <p className="text-xs text-gray-400 max-w-sm mx-auto">
              {view.settling
                ? "You can close this page — this screen and your email will both be updated as things move."
                : longRunning
                  ? "You can safely close this page. We'll email you as soon as your app is ready — check your spam or junk folder too."
                  : "This can take a few minutes. You can leave this page — we'll email you when your app is live."}
            </p>
            <Link
              href="/dashboard"
              className="inline-block text-navy-dark font-medium underline text-sm"
            >
              Go to Dashboard
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
