"use client";

import { useEffect, useState } from "react";

interface PreviewState {
  name: string;
  status: string;
  deployUrl: string | null;
  expiresAt: string | null;
  claimed: boolean;
  email: string | null;
}

const STAGES: Record<string, { label: string; pct: number }> = {
  generating: { label: "Writing your app…", pct: 35 },
  ready: { label: "Deploying…", pct: 70 },
  deploying: { label: "Deploying…", pct: 80 },
  deployed: { label: "Live", pct: 100 },
  failed: { label: "Generation failed", pct: 100 },
  deploy_failed: { label: "Deploy failed", pct: 100 },
};

function hoursLeft(iso: string | null): number | null {
  if (!iso) return null;
  return Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 3600_000));
}

export default function TryStatusClient({
  token,
  initial,
}: {
  token: string;
  initial: PreviewState;
}) {
  const [state, setState] = useState<PreviewState>(initial);

  useEffect(() => {
    if (state.status === "deployed" || state.status.endsWith("failed")) return;
    const t = setInterval(async () => {
      try {
        const res = await fetch(`/api/try/${token}`);
        if (!res.ok) return;
        const data = await res.json();
        setState((s) => ({ ...s, ...data }));
      } catch {
        /* transient */
      }
    }, 4000);
    return () => clearInterval(t);
  }, [token, state.status]);

  const stage = STAGES[state.status] ?? { label: state.status, pct: 20 };
  const failed = state.status.endsWith("failed");
  const live = state.status === "deployed" && state.deployUrl;
  const hrs = hoursLeft(state.expiresAt);
  const claimHref = `/signup?claim=${encodeURIComponent(token)}${
    state.email ? `&email=${encodeURIComponent(state.email)}` : ""
  }&next=/dashboard`;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-navy-dark">{state.name}</h1>
          <p className="text-sm text-gray-500">
            {live
              ? `Your preview is live${hrs != null ? ` — expires in ${hrs}h` : ""}.`
              : failed
                ? "Something went wrong building this one."
                : stage.label}
          </p>
        </div>
        {live && (
          <a
            href={claimHref}
            className="rounded-xl bg-navy-dark px-5 py-2.5 font-semibold text-white transition-colors hover:bg-navy"
          >
            Claim this app — free
          </a>
        )}
      </div>

      {!live && !failed && (
        <div className="mt-6 h-2 w-full overflow-hidden rounded-full bg-gray-200">
          <div
            className="h-full rounded-full bg-navy-dark transition-all duration-700"
            style={{ width: `${stage.pct}%` }}
          />
        </div>
      )}

      {failed && (
        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          The build didn&apos;t complete. Head back and{" "}
          <a href="/try" className="font-semibold underline">
            try again
          </a>{" "}
          — it usually works on a second run.
        </div>
      )}

      {live && (
        <>
          <div className="mt-6 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-2 text-xs text-gray-400">
              <span className="h-2.5 w-2.5 rounded-full bg-gray-200" />
              <span className="h-2.5 w-2.5 rounded-full bg-gray-200" />
              <span className="h-2.5 w-2.5 rounded-full bg-gray-200" />
              <span className="ml-2 truncate">{state.deployUrl}</span>
              <a
                href={state.deployUrl!}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto text-navy hover:underline"
              >
                Open ↗
              </a>
            </div>
            <iframe
              src={state.deployUrl!}
              title={state.name}
              className="h-[560px] w-full"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            />
          </div>
          <div className="mt-6 rounded-2xl border border-navy/20 bg-navy/5 p-5">
            <p className="text-sm font-semibold text-navy-dark">
              Like it? Claim it before it expires{hrs != null ? ` in ${hrs}h` : ""}.
            </p>
            <p className="mt-1 text-sm text-gray-600">
              Creating a free account keeps this app, unlocks editing it in plain English,
              connecting payments, a custom domain, and your 14-day trial of everything else.
            </p>
            <a
              href={claimHref}
              className="mt-3 inline-block rounded-xl bg-navy-dark px-5 py-2.5 font-semibold text-white transition-colors hover:bg-navy"
            >
              Claim this app — free
            </a>
          </div>
        </>
      )}
    </div>
  );
}
