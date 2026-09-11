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
  const [longRunning, setLongRunning] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const hasStarted = useRef(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const view = clientBuildState(dbStatus, { streamPhase });

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
          .select("status, deploy_url")
          .eq("id", id)
          .maybeSingle();

        if (row?.status) {
          setDbStatus(row.status);
          setStreamPhase(null);
        }
        if (row?.status === "deployed") {
          setDeployUrl(row.deploy_url ?? null);
          clearInterval(pollRef.current!);
          pollRef.current = null;
          return;
        }
        if (row?.status === "failed" || row?.status === "deploy_failed") {
          // Do NOT surface this as a failure. clientBuildState() renders it as
          // "almost there, we'll email you"; the operator is alerted server-side.
          clearInterval(pollRef.current!);
          pollRef.current = null;
          return;
        }
        // ~14 min with no terminal state — stop polling and show the calm
        // "we'll email you" note; the build has usually finished by then.
        if (attempts >= 140) {
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
          .select("status, deploy_url")
          .eq("id", appId)
          .maybeSingle();
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

  const pct = view.done ? 100 : Math.round((view.phase / BUILD_PHASES.length) * 100);

  return (
    <div className="min-h-screen bg-off-white flex flex-col">
      <AppNavbar userName={userName} plan={plan} />

      <main className="flex-1 max-w-xl mx-auto w-full px-4 py-14">
        {/* Headline */}
        <div className="text-center mb-10">
          <div className="flex items-center justify-center gap-2 mb-3">
            {view.done ? (
              <span className="text-green-500 text-lg">✓</span>
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
                view.done ? "bg-green-500" : "bg-navy-dark"
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Phase steps */}
        <div className="space-y-2.5 mb-10">
          {BUILD_PHASES.map(({ n, label }) => {
            const isDone = view.done ? true : n < view.phase;
            const isActive = !view.done && n === view.phase;
            return (
              <div
                key={n}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm border ${
                  isDone
                    ? "bg-green-50 border-green-200 text-green-700"
                    : isActive
                      ? "bg-blue-50 border-navy text-navy-dark"
                      : "bg-white border-gray-200 text-gray-400"
                }`}
              >
                <span className="shrink-0 w-4 text-center">
                  {isDone ? "✓" : isActive ? "⚙" : "○"}
                </span>
                <span className="font-medium">{label}</span>
                {isActive && (
                  <span className="ml-auto text-xs animate-pulse">…</span>
                )}
              </div>
            );
          })}
        </div>

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

        {/* In progress (incl. the calm "settling" state) */}
        {!view.done && (
          <div className="text-center space-y-3">
            <p className="text-xs text-gray-400 max-w-sm mx-auto">
              {view.settling || longRunning
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
