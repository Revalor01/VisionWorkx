"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import AppNavbar from "@/components/nav/AppNavbar";
import type { Plan, SubscriptionStatus } from "@/lib/database.types";

interface BillingClientProps {
  profile: { plan: Plan; fullName: string | null; email?: string | null };
  subscription: {
    plan: Exclude<Plan, "free"> | null;
    status: SubscriptionStatus | null;
    currentPeriodEnd: string | null;
    hasStripeCustomer: boolean;
  } | null;
  appCount: number;
  trialDaysLeft: number;
  isInTrial: boolean;
  priceIds: { starter: string; growth: string; pro: string };
}

const PLANS: {
  name: Exclude<Plan, "free">;
  label: string;
  price: string;
  annual: string;
  apps: string;
  appLimit: number;
  features: string[];
  highlight: boolean;
}[] = [
  {
    name: "starter",
    label: "Starter",
    price: "$49",
    annual: "$349/yr",
    apps: "1 app",
    appLimit: 1,
    features: [
      "Subdomain hosting",
      "Core app features",
      "Email support",
      "14-day free trial",
    ],
    highlight: false,
  },
  {
    name: "growth",
    label: "Growth",
    price: "$99",
    annual: "$699/yr",
    apps: "3 apps",
    appLimit: 3,
    features: [
      "Custom domain",
      "Advanced analytics",
      "Priority support",
      "14-day free trial",
    ],
    highlight: true,
  },
  {
    name: "pro",
    label: "Pro",
    price: "$199",
    annual: "$1,399/yr",
    apps: "Unlimited apps",
    appLimit: Infinity,
    features: [
      "White label",
      "API access",
      "Dedicated onboarding",
      "14-day free trial",
    ],
    highlight: false,
  },
];

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  active: { label: "Active", cls: "bg-green-100 text-green-700" },
  trialing: { label: "Trial", cls: "bg-blue-100 text-blue-700" },
  past_due: { label: "Past due", cls: "bg-red-100 text-red-700" },
  cancelled: { label: "Cancelled", cls: "bg-gray-100 text-gray-600" },
};

const APP_LIMITS: Record<Plan, number> = {
  free: 0,
  starter: 1,
  growth: 3,
  pro: Infinity,
};

export default function BillingClient({
  profile,
  subscription,
  appCount,
  trialDaysLeft,
  isInTrial,
  priceIds,
}: BillingClientProps) {
  const searchParams = useSearchParams();
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Handle Stripe redirect back with ?checkout=success
  useEffect(() => {
    if (searchParams.get("checkout") === "success") {
      setSuccessMsg(
        "You're all set! Your subscription is now active. It may take a moment to reflect here."
      );
    }
  }, [searchParams]);

  async function handleCheckout(priceId: string, planName: string) {
    setLoadingPlan(planName);
    setError("");
    try {
      const res = await fetch("/api/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create checkout");
      window.location.href = data.url;
    } catch (err) {
      setError((err as Error).message);
      setLoadingPlan(null);
    }
  }

  async function handlePortal() {
    setPortalLoading(true);
    setError("");
    try {
      const res = await fetch("/api/create-portal", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to open billing portal");
      window.location.href = data.url;
    } catch (err) {
      setError((err as Error).message);
      setPortalLoading(false);
    }
  }

  const currentPlan = subscription?.plan ?? profile.plan;
  const subStatus = subscription?.status;
  const appLimit = APP_LIMITS[currentPlan] ?? 0;

  return (
    <div className="min-h-screen bg-off-white flex flex-col">
      <AppNavbar userName={profile.fullName} plan={profile.plan} userEmail={profile.email} />

      <main className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-navy-dark">
            Billing &amp; Subscription
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Manage your plan and payment details.
          </p>
        </div>

        {/* Success banner */}
        {successMsg && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-2xl text-green-700 text-sm flex items-start gap-3">
            <span className="text-lg">🎉</span>
            <p>{successMsg}</p>
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-2xl text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* Trial banner */}
        {isInTrial && (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-2xl flex items-center justify-between gap-4">
            <div>
              <p className="font-semibold text-navy-dark text-sm">
                Free trial — {trialDaysLeft} day{trialDaysLeft !== 1 ? "s" : ""}{" "}
                remaining
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                Choose a plan before your trial ends to keep access.
              </p>
            </div>
            <div className="w-32 bg-blue-100 rounded-full h-2 shrink-0">
              <div
                className="bg-navy-dark h-2 rounded-full"
                style={{ width: `${((14 - trialDaysLeft) / 14) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Current plan card */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 mb-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-sm text-gray-500 mb-1">Current plan</p>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-lg font-bold text-navy-dark capitalize">
                {currentPlan === "free" ? "Free trial" : currentPlan}
              </span>
              {subStatus && STATUS_BADGE[subStatus] && (
                <span
                  className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_BADGE[subStatus].cls}`}
                >
                  {STATUS_BADGE[subStatus].label}
                </span>
              )}
            </div>
            {subscription?.currentPeriodEnd && (
              <p className="text-xs text-gray-400 mt-1">
                {subStatus === "cancelled" ? "Access until" : "Renews on"}{" "}
                {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
              </p>
            )}
            {currentPlan !== "pro" && appLimit > 0 && (
              <p className="text-xs text-gray-400 mt-0.5">
                {appCount} / {appLimit} app{appLimit !== 1 ? "s" : ""} used
              </p>
            )}
          </div>

          {subscription?.hasStripeCustomer && (
            <button
              onClick={handlePortal}
              disabled={portalLoading}
              className="shrink-0 text-sm font-medium border border-gray-300 text-gray-700 px-5 py-2.5 rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-60"
            >
              {portalLoading ? "Opening…" : "Manage Billing →"}
            </button>
          )}
        </div>

        {/* Plan cards */}
        <h2 className="text-lg font-bold text-navy-dark mb-5">
          {subscription?.status === "active" || subscription?.status === "trialing"
            ? "Change plan"
            : "Choose a plan"}
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {PLANS.map((plan) => {
            const isCurrent =
              (subscription?.plan ?? null) === plan.name &&
              (subStatus === "active" || subStatus === "trialing");

            return (
              <div
                key={plan.name}
                className={`rounded-2xl p-6 flex flex-col ${
                  plan.highlight
                    ? "bg-navy-dark text-white ring-2 ring-navy shadow-xl"
                    : "bg-white border border-gray-200"
                } ${isCurrent ? "opacity-75" : ""}`}
              >
                <div className="flex-1">
                  <p
                    className={`text-xs font-semibold uppercase tracking-wider mb-2 ${
                      plan.highlight ? "text-blue-300" : "text-navy"
                    }`}
                  >
                    {plan.label}
                    {isCurrent && " · Current"}
                  </p>
                  <div className="flex items-end gap-1 mb-1">
                    <span className="text-3xl font-bold">{plan.price}</span>
                    <span
                      className={`text-xs mb-1.5 ${
                        plan.highlight ? "text-blue-200" : "text-gray-500"
                      }`}
                    >
                      /mo
                    </span>
                  </div>
                  <p
                    className={`text-xs mb-4 ${
                      plan.highlight ? "text-blue-300" : "text-gray-400"
                    }`}
                  >
                    or {plan.annual} annually · {plan.apps}
                  </p>
                  <ul className="space-y-1.5 mb-6">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-center gap-2 text-xs">
                        <span
                          className={plan.highlight ? "text-blue-300" : "text-navy"}
                        >
                          ✓
                        </span>
                        <span
                          className={
                            plan.highlight ? "text-blue-100" : "text-gray-700"
                          }
                        >
                          {f}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                {isCurrent ? (
                  <div
                    className={`text-center text-sm font-semibold py-2.5 rounded-xl ${
                      plan.highlight
                        ? "bg-blue-900/50 text-blue-300"
                        : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    Current plan
                  </div>
                ) : subscription?.hasStripeCustomer ? (
                  <button
                    onClick={handlePortal}
                    disabled={portalLoading}
                    className={`text-center text-sm font-semibold py-2.5 rounded-xl transition-colors disabled:opacity-60 ${
                      plan.highlight
                        ? "bg-navy text-white hover:bg-blue-600"
                        : "border-2 border-navy text-navy hover:bg-navy hover:text-white"
                    }`}
                  >
                    {portalLoading ? "Opening…" : `Switch to ${plan.label}`}
                  </button>
                ) : (
                  <button
                    onClick={() =>
                      handleCheckout(priceIds[plan.name], plan.name)
                    }
                    disabled={loadingPlan !== null}
                    className={`text-center text-sm font-semibold py-2.5 rounded-xl transition-colors disabled:opacity-60 ${
                      plan.highlight
                        ? "bg-navy text-white hover:bg-blue-600"
                        : "border-2 border-navy text-navy hover:bg-navy hover:text-white"
                    }`}
                  >
                    {loadingPlan === plan.name
                      ? "Redirecting…"
                      : "Start Free Trial"}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <p className="mt-6 text-xs text-center text-gray-400">
          14-day free trial on all plans · No credit card required to start ·
          Cancel anytime ·{" "}
          <Link href="/#pricing" className="text-navy underline">
            Full feature comparison
          </Link>
        </p>
      </main>
    </div>
  );
}
