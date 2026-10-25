"use client";

import { useState } from "react";

// "Fix this" on a failing test: asks the qa-fix workflow (revalor-agents) to run
// an AI agent against the product's repo and open a DRAFT PR for review. Async —
// the PR shows up on the repo a few minutes later, so we just confirm it was
// requested and link to the repo's pull requests.

type State = { kind: "idle" } | { kind: "sending" } | { kind: "sent"; prsUrl: string } | { kind: "error"; text: string };

export default function FixButton({ runId, resultId }: { runId: string; resultId: string }) {
  const [state, setState] = useState<State>({ kind: "idle" });

  async function request() {
    setState({ kind: "sending" });
    try {
      const res = await fetch("/api/admin/qa/fix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId, resultId }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; prsUrl?: string };
      if (!res.ok) throw new Error(data.error || "Couldn't request a fix.");
      setState({ kind: "sent", prsUrl: data.prsUrl ?? "" });
    } catch (err) {
      setState({ kind: "error", text: err instanceof Error ? err.message : "Couldn't request a fix." });
    }
  }

  if (state.kind === "sent") {
    return (
      <p className="text-sm text-emerald-700">
        Fix requested — the agent will open a draft PR for review.{" "}
        {state.prsUrl && (
          <a href={state.prsUrl} target="_blank" rel="noopener noreferrer" className="text-navy underline">
            View pull requests →
          </a>
        )}
      </p>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={request}
        disabled={state.kind === "sending"}
        className="rounded-lg border border-[#B8860B] px-3 py-1.5 text-sm font-semibold text-[#8a650a] transition hover:bg-[#B8860B]/10 disabled:opacity-60"
      >
        {state.kind === "sending" ? "Requesting…" : "Fix this with AI"}
      </button>
      {state.kind === "error" && <span className="text-sm text-red-600">{state.text}</span>}
    </div>
  );
}
