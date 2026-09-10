"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PaymentsStatus } from "@/lib/database.types";

export default function PaymentsCard({
  appId,
  initialStatus,
  feePercent = 0,
}: {
  appId: string;
  initialStatus: PaymentsStatus;
  /** VisionWorkx's cut of each payment, as a percent. 0 = no fee. */
  feePercent?: number;
}) {
  const [status, setStatus] = useState<PaymentsStatus>(initialStatus);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const polled = useRef(false);

  const sync = useCallback(async () => {
    try {
      const res = await fetch(`/api/apps/${appId}/payments/connect`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.status) setStatus(data.status);
    } catch {
      /* transient */
    }
  }, [appId]);

  // On return from Stripe onboarding the status may still read "pending"
  // locally — reconcile once on mount, and again shortly after if it's
  // still not settled.
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
      const res = await fetch(`/api/apps/${appId}/payments/connect`, { method: "POST" });
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
    <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
      <h2 className="font-semibold text-navy-dark mb-1">Accept payments</h2>

      {status === "active" ? (
        <>
          <p className="text-sm text-green-700 mb-3">
            ✓ Payments are on. Your app can charge customers, and the money goes straight to your
            own Stripe account.
            {feePercent > 0 && (
              <> VisionWorkx keeps {feePercent}% of each payment as a processing fee.</>
            )}
          </p>
          <a
            href="https://dashboard.stripe.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-navy hover:underline"
          >
            Open your Stripe Dashboard →
          </a>
        </>
      ) : (
        <>
          <p className="text-gray-500 text-sm mb-4">
            {status === "pending"
              ? "Stripe still needs a few details before your app can take payments. Pick up where you left off — it takes about two minutes."
              : `Let customers pay you right inside your app. Connect a Stripe account (or make a new one) and payment features turn on automatically.${
                  feePercent > 0
                    ? ` VisionWorkx keeps ${feePercent}% of each payment; Stripe's own fees are separate.`
                    : ""
                }`}
          </p>
          <button
            onClick={start}
            disabled={working}
            className="bg-navy-dark text-white font-semibold px-5 py-2.5 rounded-xl hover:bg-navy transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {working
              ? "Opening Stripe…"
              : status === "pending"
                ? "Finish payment setup"
                : "Set up payments"}
          </button>
        </>
      )}

      {error && (
        <div className="mt-3 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}

      <details className="group mt-4 border-t border-gray-100 pt-3">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm font-medium text-navy hover:underline">
          <span className="text-xs transition-transform group-open:rotate-90">
            &#8250;
          </span>
          How this works
        </summary>
        <div className="mt-3 space-y-2 border-l-2 border-gray-100 pl-4 text-sm text-gray-600">
          <p>
            Payments run through <strong>your own</strong> Stripe account — you
            own the account, your customers, and the money. VisionWorkx just
            creates the checkout page for you.
            {feePercent > 0 && (
              <>
                {" "}
                VisionWorkx keeps {feePercent}% of each payment; Stripe&rsquo;s
                own fees (about 2.9% + 30&cent;) are separate.
              </>
            )}
          </p>
          <p>
            <strong>Setup takes about two minutes.</strong> &ldquo;Set up
            payments&rdquo; sends you to Stripe. Have ready: your business type,
            an EIN or SSN, your address and date of birth, and a bank account
            for payouts.
          </p>
          <p>
            Once Stripe clears you, payment features switch on automatically —
            checkout, booking deposits, invoice payments, or subscriptions,
            whichever your app uses. If Stripe still needs something you&rsquo;ll
            come back to a <strong>Finish payment setup</strong> button here.
          </p>
          <p>
            Stripe pays out to your bank on a rolling schedule (about two
            business days per charge; the first payout can take around a week).
            See every charge and payout in your Stripe Dashboard.
          </p>
        </div>
      </details>
    </section>
  );
}
