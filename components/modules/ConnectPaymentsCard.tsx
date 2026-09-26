"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export default function ConnectPaymentsCard({
  slug,
  initialStatus,
  feePercent = 0,
}: {
  slug: string;
  initialStatus: "none" | "pending" | "active";
  /** VisionWorkx's cut of each customer payment, as a percent. 0 = no fee. */
  feePercent?: number;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const polled = useRef(false);

  const sync = useCallback(async () => {
    try {
      const res = await fetch(`/api/workspace/${slug}/payments/connect`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.status) setStatus(data.status);
    } catch {
      /* transient */
    }
  }, [slug]);

  // On return from Stripe onboarding the status may still read "pending"
  // locally — reconcile once on mount, and again shortly after if not settled.
  useEffect(() => {
    if (polled.current) return;
    polled.current = true;
    if (status === "active") return;
    sync();
    const t = setTimeout(sync, 4000);
    return () => clearTimeout(t);
  }, [status, sync]);

  async function start() {
    if (working) return;
    setWorking(true);
    setError("");
    try {
      const res = await fetch(`/api/workspace/${slug}/payments/connect`, { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.url) {
        setError(data.error ?? "Couldn't start Stripe setup.");
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("Network error — try again.");
      setWorking(false);
    }
  }

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6" aria-labelledby="connect-h">
      <h2 id="connect-h" className="text-lg font-bold text-navy-dark">Accept payments from your customers</h2>
      <p className="mt-1 text-sm text-gray-500">
        Separate from your VisionWorkx plan — this connects a Stripe account so your own forms can
        collect deposits or send payment links, and the money goes straight to you.
      </p>

      {status === "active" ? (
        <>
          <p className="mt-3 text-sm text-emerald-700">
            ✓ Payments are on. Deposits and payment links now work on your forms.
            {feePercent > 0 && <> VisionWorkx keeps {feePercent}% of each payment as a processing fee.</>}
          </p>
          <a href="https://dashboard.stripe.com" target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-sm text-navy hover:underline">
            Open your Stripe Dashboard →
          </a>
        </>
      ) : (
        <>
          <p className="mt-3 text-sm text-gray-600">
            {status === "pending"
              ? "Stripe still needs a few details before you can take payments. Pick up where you left off — it takes about two minutes."
              : `Connect a Stripe account (or make a new one) and payment collection turns on automatically.${
                  feePercent > 0 ? ` VisionWorkx keeps ${feePercent}% of each payment; Stripe's own fees are separate.` : ""
                }`}
          </p>
          <button
            type="button"
            onClick={start}
            disabled={working}
            className="mt-3 rounded-xl bg-navy-dark px-5 py-2.5 text-sm font-semibold text-white hover:bg-navy disabled:opacity-60"
          >
            {working ? "Opening…" : status === "pending" ? "Finish payment setup" : "Connect Stripe"}
          </button>
        </>
      )}

      {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
    </section>
  );
}
