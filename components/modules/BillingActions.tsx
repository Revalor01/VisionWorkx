"use client";

import { useState } from "react";
import { PLAN_LIMITS, PLAN_PRICE, PLANS, type ModulePlan } from "@/lib/modules/plans";

export default function BillingActions({ slug, status, currentPlan }: { slug: string; status: string; currentPlan: ModulePlan }) {
  const [interval, setInterval] = useState<"monthly" | "annual">("monthly");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function go(path: string, body?: object) {
    setBusy(path);
    setError("");
    try {
      const res = await fetch(`/api/workspace/${slug}/billing/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) throw new Error(data.error || "Couldn't open billing. Please try again.");
      window.location.assign(data.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't open billing.");
      setBusy(null);
    }
  }

  if (status === "comped") return null;
  if (status === "trialing" || status === "active" || status === "past_due") {
    return (
      <div className="mt-5">
        <button type="button" onClick={() => go("portal")} disabled={!!busy} className="rounded-xl bg-navy-dark px-5 py-2.5 font-semibold text-white hover:bg-navy disabled:opacity-60">
          {busy ? "Opening…" : "Manage billing"}
        </button>
        <p className="mt-2 text-xs text-gray-500">Change plan, update your card, see invoices or cancel.</p>
        {error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <div className="mt-6">
      <div className="mb-4 inline-flex rounded-full border border-gray-200 bg-gray-50 p-1" role="group" aria-label="Billing interval">
        {(["monthly", "annual"] as const).map((i) => (
          <button
            key={i}
            type="button"
            aria-pressed={interval === i}
            onClick={() => setInterval(i)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold ${interval === i ? "bg-white text-navy-dark shadow-sm" : "text-gray-600"}`}
          >
            {i === "monthly" ? "Monthly" : "Annual · save 20%"}
          </button>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {PLANS.map((p) => {
          const l = PLAN_LIMITS[p];
          const price = PLAN_PRICE[p];
          return (
            <div key={p} className={`rounded-2xl border p-5 ${p === currentPlan ? "border-navy" : "border-gray-200"}`}>
              <h3 className="font-bold text-navy-dark">{price.label}</h3>
              <p className="mt-1 text-2xl font-bold tabular-nums text-gray-900">
                ${interval === "monthly" ? price.monthly : price.annual.toLocaleString()}
                <span className="text-sm font-normal text-gray-500">/{interval === "monthly" ? "mo" : "yr"}</span>
              </p>
              <ul className="mt-3 space-y-1 text-sm text-gray-600">
                <li>{l.modules} modules</li>
                <li>{l.submissionsPerMonth.toLocaleString()} submissions/mo</li>
                <li>{l.emailsPerMonth.toLocaleString()} automatic emails/mo</li>
                <li>{l.storageBytes / 1024 ** 3} GB file storage</li>
              </ul>
              <button
                type="button"
                onClick={() => go("checkout", { plan: p, interval })}
                disabled={!!busy}
                className="mt-4 w-full rounded-xl bg-navy-dark py-2.5 text-sm font-semibold text-white hover:bg-navy disabled:opacity-60"
              >
                {busy ? "Opening…" : status === "none" ? "Start 14-day free trial" : `Choose ${price.label}`}
              </button>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-gray-500">
        {status === "none"
          ? "Card required. You won't be charged until your trial ends, and you can cancel any time before then."
          : "Your forms switch back on as soon as your plan starts."}
      </p>
      {error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
