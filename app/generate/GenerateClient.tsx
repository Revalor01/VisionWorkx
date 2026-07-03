"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import AppNavbar from "@/components/nav/AppNavbar";

type Status = "connecting" | "generating" | "complete" | "failed";

const STATUS_HEADLINE: Record<Status, string> = {
  connecting: "Connecting to Vision Workx AI…",
  generating: "Generating your app…",
  complete: "Your app is ready!",
  failed: "Generation failed",
};

const STATUS_SUB: Record<Status, string> = {
  connecting: "Warming up the AI — this takes just a moment.",
  generating:
    "Watch your app being written in real time. This usually takes 2–5 minutes.",
  complete:
    "Your app code has been saved. Head to your dashboard to view and launch it.",
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

  const codeWindowRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const hasStarted = useRef(false);

  // Auto-scroll code window as new content arrives
  useEffect(() => {
    const el = codeWindowRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [streamedText]);

  // Slow progress animation during generation (caps at 88%)
  useEffect(() => {
    if (status !== "generating") return;
    const interval = setInterval(() => {
      setProgress((p) => Math.min(p + 0.4, 88));
    }, 2000);
    return () => clearInterval(interval);
  }, [status]);

  const startGeneration = useCallback(async (id: string) => {
    abortRef.current = new AbortController();
    setStatus("connecting");
    setProgress(5);
    setStreamedText("");
    setError("");

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

      // Stream closed — Supabase save already completed server-side
      setStatus("complete");
      setProgress(100);
    } catch (err) {
      if ((err as Error).name === "AbortError") return; // user navigated away
      console.error("[generate client]", err);
      setError(
        (err as Error).message ||
          "An unexpected error occurred. Please try again."
      );
      setStatus("failed");
    }
  }, []);

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

  return (
    <div className="min-h-screen bg-off-white flex flex-col">
      <AppNavbar userName={userName} plan={plan} />

      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-10">
        {/* Headline */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-3">
            {status === "generating" && (
              <span className="inline-block w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            )}
            {status === "complete" && (
              <span className="text-green-500 text-lg">✓</span>
            )}
            {status === "failed" && (
              <span className="text-red-500 text-lg">✗</span>
            )}
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
                status === "complete"
                  ? "bg-green-500"
                  : status === "failed"
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
          {/* Window chrome */}
          <div className="flex items-center gap-2 px-4 py-3 bg-[#161b22] border-b border-gray-800">
            <span className="w-3 h-3 rounded-full bg-[#ff5f57]" />
            <span className="w-3 h-3 rounded-full bg-[#febc2e]" />
            <span className="w-3 h-3 rounded-full bg-[#28c840]" />
            <span className="ml-4 text-xs text-gray-500 font-mono">
              vision-workx-ai — generating app…
            </span>
            {status === "generating" && (
              <span className="ml-auto text-xs text-green-400 font-mono animate-pulse">
                ● LIVE
              </span>
            )}
            {status === "complete" && (
              <span className="ml-auto text-xs text-green-400 font-mono">
                ✓ DONE
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

            {streamedText === "" && status === "generating" && (
              <p className="text-yellow-400 animate-pulse">
                $ Building your app — code will appear here shortly…
              </p>
            )}

            {streamedText !== "" && (
              <pre className="whitespace-pre-wrap text-gray-300">
                {streamedText}
                {status === "generating" && (
                  <span className="inline-block w-2 h-4 bg-gray-300 animate-pulse ml-0.5 align-middle" />
                )}
              </pre>
            )}

            {status === "complete" && streamedText === "" && (
              <p className="text-green-400">✓ Generation complete.</p>
            )}

            {status === "failed" && (
              <p className="text-red-400">✗ Error during generation.</p>
            )}
          </div>
        </div>

        {/* Status steps */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
          {STEPS.map((step, i) => {
            const isDone =
              (i === 0 && ["generating", "complete"].includes(status)) ||
              (i === 1 && status === "complete") ||
              (i === 2 && false); // deploy triggered separately (Prompt 8)
            const isActive = i === 0 && status === "generating";

            return (
              <div
                key={step.key}
                className={`flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm border ${
                  isDone
                    ? "bg-green-50 border-green-200 text-green-700"
                    : isActive
                    ? "bg-blue-50 border-navy text-navy-dark"
                    : "bg-white border-gray-200 text-gray-400"
                }`}
              >
                <span className="shrink-0">
                  {isDone ? "✓" : isActive ? "⚙" : "○"}
                </span>
                <span className="font-medium">{step.label}</span>
                {isActive && (
                  <span className="ml-auto text-xs animate-pulse">…</span>
                )}
              </div>
            );
          })}
        </div>

        {/* Actions */}
        {status === "complete" && (
          <div className="text-center space-y-3">
            <Link
              href="/dashboard"
              className="inline-block bg-navy-dark text-white font-semibold px-10 py-3.5 rounded-xl text-base hover:bg-navy transition-colors"
            >
              View Your App in Dashboard →
            </Link>
            <p className="text-xs text-gray-400">
              Your app will be automatically deployed once our system processes
              it.
            </p>
          </div>
        )}

        {status === "failed" && (
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
