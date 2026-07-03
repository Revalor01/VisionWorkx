"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import AppNavbar from "@/components/nav/AppNavbar";

type Status = "connecting" | "generating" | "deploying" | "complete" | "failed";

const STATUS_HEADLINE: Record<Status, string> = {
  connecting: "Connecting to Vision Workx AI…",
  generating: "Generating your app…",
  deploying: "Deploying your app…",
  complete: "Your app is live!",
  failed: "Generation failed",
};

const STATUS_SUB: Record<Status, string> = {
  connecting: "Warming up the AI — this takes just a moment.",
  generating:
    "Watch your app being written in real time. This usually takes 2–5 minutes.",
  deploying:
    "Building and deploying to Vercel. This takes 3–6 minutes — feel free to leave this page.",
  complete:
    "Your app is live and connected to your database. Check your email for the link!",
  failed:
    "Something went wrong during generation. Your progress has been saved — please try again.",
};

const STEPS = [
  { key: "generating", label: "Generating code" },
  { key: "saving", label: "Saving to your account" },
  { key: "deploying", label: "Deploying to Vercel" },
] as const;

export default function GenerateClient({
  userName,
  plan,
}: {
  userName: string | null;
  plan: import("@/lib/database.types").Plan;
}) {
  const searchParams = useSearchParams();
  const appId = searchParams.get("appId");

  const [status, setStatus] = useState<Status>("connecting");
  const [streamedText, setStreamedText] = useState("");
  const [progress, setProgress] = useState(5);
  const [error, setError] = useState("");
  const [deployUrl, setDeployUrl] = useState<string | null>(null);

  const codeWindowRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const hasStarted = useRef(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-scroll code window as new content arrives
  useEffect(() => {
    const el = codeWindowRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [streamedText]);

  // Slow progress animation during generation (caps at 65%)
  useEffect(() => {
    if (status !== "generating") return;
    const interval = setInterval(() => {
      setProgress((p) => Math.min(p + 0.4, 65));
    }, 2000);
    return () => clearInterval(interval);
  }, [status]);

  // Deploying progress animation (65% → 95%)
  useEffect(() => {
    if (status !== "deploying") return;
    setProgress(68);
    const interval = setInterval(() => {
      setProgress((p) => Math.min(p + 0.15, 95));
    }, 2000);
    return () => clearInterval(interval);
  }, [status]);

  // Poll Supabase REST for deploy_url after code generation completes
  const startPolling = useCallback((id: string) => {
    if (pollRef.current) clearInterval(pollRef.current);

    pollRef.current = setInterval(async () => {
      try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
        const res = await fetch(
          `${supabaseUrl}/rest/v1/apps?id=eq.${id}&select=status,deploy_url`,
          {
            headers: {
              apikey: anonKey,
              Authorization: `Bearer ${anonKey}`,
            },
          }
        );
        if (!res.ok) return;
        const [row] = await res.json();
        if (!row) return;

        if (row.deploy_url) {
          clearInterval(pollRef.current!);
          setDeployUrl(row.deploy_url);
          setStatus("complete");
          setProgress(100);
        } else if (row.status === "failed") {
          clearInterval(pollRef.current!);
          setError("Deployment failed. Please try again from your dashboard.");
          setStatus("failed");
        }
      } catch {
        // ignore network errors — keep polling
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
      setStatus("connecting");
      setProgress(5);
      setStreamedText("");
      setError("");
      setDeployUrl(null);

      try {
        const response = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ appId: id }),
          signal: abortRef.current.signal,
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(
            (data as { error?: string }).error ?? `HTTP ${response.status}`
          );
        }

        if (!response.body) throw new Error("No response body");

        setStatus("generating");
        setProgress(10);

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          setStreamedText((prev) => prev + chunk);
        }

        // Stream closed — code saved server-side, deploy pipeline fired
        setStatus("deploying");
        setProgress(68);
        startPolling(id);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        console.error("[generate client]", err);
        setError(
          (err as Error).message ||
            "An unexpected error occurred. Please try again."
        );
        setStatus("failed");
      }
    },
    [startPolling]
  );

  useEffect(() => {
    if (!appId || hasStarted.current) return;
    hasStarted.current = true;
    startGeneration(appId);

    return () => {
      abortRef.current?.abort();
    };
  }, [appId, startGeneration]);

  if (!appId) {
    return (
      <div className="min-h-screen bg-off-white flex flex-col">
        <AppNavbar userName={userName} plan={plan} />
        <main className="flex-1 flex items-center justify-center px-4">
          <div className="text-center max-w-md">
            <div className="text-5xl mb-4">⚠️</div>
            <h1 className="text-xl font-bold text-navy-dark mb-2">
              Missing app ID
            </h1>
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

  const codeLineCount = streamedText.split("\n").length;
  const isGenerating = status === "generating";
  const isDeploying = status === "deploying";
  const isDone = status === "complete";
  const isFailed = status === "failed";

  return (
    <div className="min-h-screen bg-off-white flex flex-col">
      <AppNavbar userName={userName} plan={plan} />

      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-10">
        {/* Headline */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-3">
            {(isGenerating || isDeploying) && (
              <span className="inline-block w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            )}
            {isDone && <span className="text-green-500 text-lg">✓</span>}
            {isFailed && <span className="text-red-500 text-lg">✗</span>}
            <h1 className="text-2xl font-bold text-navy-dark">
              {STATUS_HEADLINE[status]}
            </h1>
          </div>
          <p className="text-gray-500 text-sm max-w-md mx-auto">
            {STATUS_SUB[status]}
          </p>
          {error && (
            <p className="mt-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2 inline-block">
              {error}
            </p>
          )}
        </div>

        {/* Progress bar */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-1">
            <span className="text-xs text-gray-400">Progress</span>
            <span className="text-xs text-gray-400">{Math.round(progress)}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all duration-1000 ${
                isDone
                  ? "bg-green-500"
                  : isFailed
                  ? "bg-red-500"
                  : "bg-navy-dark"
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
          {streamedText && (
            <p className="text-xs text-gray-400 mt-1 text-right">
              {codeLineCount.toLocaleString()} lines generated
            </p>
          )}
        </div>

        {/* Code window */}
        <div className="bg-[#0d1117] rounded-2xl overflow-hidden shadow-2xl border border-gray-800 mb-6">
          <div className="flex items-center gap-2 px-4 py-3 bg-[#161b22] border-b border-gray-800">
            <span className="w-3 h-3 rounded-full bg-[#ff5f57]" />
            <span className="w-3 h-3 rounded-full bg-[#febc2e]" />
            <span className="w-3 h-3 rounded-full bg-[#28c840]" />
            <span className="ml-4 text-xs text-gray-500 font-mono">
              {isDeploying
                ? "vision-workx-ai — deploying to vercel…"
                : isDone
                ? "vision-workx-ai — deployment complete"
                : "vision-workx-ai — generating app…"}
            </span>
            {isGenerating && (
              <span className="ml-auto text-xs text-green-400 font-mono animate-pulse">
                ● LIVE
              </span>
            )}
            {isDeploying && (
              <span className="ml-auto text-xs text-yellow-400 font-mono animate-pulse">
                ⚙ BUILDING
              </span>
            )}
            {isDone && (
              <span className="ml-auto text-xs text-green-400 font-mono">
                ✓ DEPLOYED
              </span>
            )}
          </div>

          <div
            ref={codeWindowRef}
            className="p-5 font-mono text-xs leading-relaxed max-h-[55vh] overflow-y-auto scroll-smooth"
            style={{ minHeight: "280px" }}
          >
            {status === "connecting" && (
              <p className="text-blue-400 animate-pulse">
                $ Connecting to Vision Workx AI…
              </p>
            )}

            {streamedText === "" && isGenerating && (
              <p className="text-yellow-400 animate-pulse">
                $ Building your app — code will appear here shortly…
              </p>
            )}

            {streamedText !== "" && (
              <pre className="whitespace-pre-wrap text-gray-300">
                {streamedText}
                {isGenerating && (
                  <span className="inline-block w-2 h-4 bg-gray-300 animate-pulse ml-0.5 align-middle" />
                )}
              </pre>
            )}

            {isDeploying && (
              <div className="mt-4 text-yellow-300 space-y-1">
                <p className="animate-pulse">$ npm install &amp;&amp; npm run build</p>
                <p className="text-gray-500 text-xs">Building on Vercel infrastructure — this takes 3–6 minutes…</p>
              </div>
            )}

            {isDone && deployUrl && (
              <p className="text-green-400 mt-4">
                ✓ Live at:{" "}
                <a href={deployUrl} className="underline" target="_blank" rel="noreferrer">
                  {deployUrl}
                </a>
              </p>
            )}

            {isDone && streamedText === "" && (
              <p className="text-green-400">✓ Generation and deployment complete.</p>
            )}

            {isFailed && (
              <p className="text-red-400">✗ Error during generation.</p>
            )}
          </div>
        </div>

        {/* Status steps */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
          {STEPS.map((step, i) => {
            const isDoneStep =
              (i === 0 && ["generating", "deploying", "complete"].includes(status)) ||
              (i === 1 && ["deploying", "complete"].includes(status)) ||
              (i === 2 && status === "complete");
            const isActiveStep =
              (i === 0 && status === "generating") ||
              (i === 1 && status === "generating") ||
              (i === 2 && status === "deploying");

            return (
              <div
                key={step.key}
                className={`flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm border ${
                  isDoneStep
                    ? "bg-green-50 border-green-200 text-green-700"
                    : isActiveStep
                    ? "bg-blue-50 border-navy text-navy-dark"
                    : "bg-white border-gray-200 text-gray-400"
                }`}
              >
                <span className="shrink-0">
                  {isDoneStep ? "✓" : isActiveStep ? "⚙" : "○"}
                </span>
                <span className="font-medium">{step.label}</span>
                {isActiveStep && (
                  <span className="ml-auto text-xs animate-pulse">…</span>
                )}
              </div>
            );
          })}
        </div>

        {/* Actions */}
        {isDone && (
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

        {isDeploying && (
          <div className="text-center">
            <p className="text-xs text-gray-400">
              Your app is building on Vercel. You can safely leave this page —
              we&apos;ll email you when it&apos;s live.
            </p>
            <Link
              href="/dashboard"
              className="inline-block mt-3 text-navy-dark font-medium underline text-sm"
            >
              Go to Dashboard
            </Link>
          </div>
        )}

        {isFailed && (
          <div className="text-center space-y-3">
            <button
              onClick={() => {
                hasStarted.current = false;
                startGeneration(appId);
              }}
              className="inline-block bg-red-600 text-white font-semibold px-8 py-3 rounded-xl hover:bg-red-700 transition-colors"
            >
              Try Again
            </button>
            <p className="text-xs text-gray-400">
              Or{" "}
              <Link href="/dashboard" className="text-navy underline">
                go to your dashboard
              </Link>{" "}
              and generate a new app.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
