"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RequirementsPanel({
  requiredActions,
  completedActions,
}: {
  requiredActions: string[];
  completedActions: string[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [completed, setCompleted] = useState<Set<string>>(new Set(completedActions));
  const [error, setError] = useState("");

  async function handleToggle(action: string) {
    setPending(action);
    setError("");
    try {
      const res = await fetch("/api/partners/actions/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      setCompleted(new Set<string>(data.completedPromotionalActions));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setPending(null);
    }
  }

  const doneCount = requiredActions.filter((a) => completed.has(a)).length;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-navy-dark">Partnership Requirements</h2>
        <span className="text-xs font-semibold text-gray-500">
          {doneCount}/{requiredActions.length} complete
        </span>
      </div>
      {error && (
        <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
      )}
      <p className="text-xs text-gray-400 mb-4">
        Check off each item once you&apos;ve completed it. We take your word for it — no verification needed.
      </p>
      <div className="space-y-2">
        {requiredActions.map((action) => {
          const isDone = completed.has(action);
          return (
            <label
              key={action}
              className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 hover:border-navy cursor-pointer transition-colors"
            >
              <input
                type="checkbox"
                checked={isDone}
                disabled={pending === action}
                onChange={() => handleToggle(action)}
                className="accent-navy-dark w-4 h-4 shrink-0"
              />
              <span className={`text-sm ${isDone ? "text-gray-400 line-through" : "text-navy-dark"}`}>{action}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
