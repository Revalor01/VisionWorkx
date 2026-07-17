"use client";

import { useState } from "react";
import Link from "next/link";

const PLANS = [
  {
    name: "Starter",
    monthly: 49,
    annual: 39,
    annualTotal: 468,
    apps: "1 app included",
    description: "Perfect for getting your first business app live.",
    features: [
      "1 AI-generated app",
      "Hosting included",
      "Full app functionality",
      "Email support",
      "14-day free trial",
    ],
    highlight: false,
    badge: null,
  },
  {
    name: "Growth",
    monthly: 99,
    annual: 79,
    annualTotal: 948,
    apps: "3 apps included",
    description: "For growing businesses that need more reach.",
    features: [
      "3 AI-generated apps",
      "Hosting included",
      "Full app functionality",
      "Priority email support",
      "14-day free trial",
    ],
    highlight: true,
    badge: "Most Popular",
  },
  {
    name: "Pro",
    monthly: 199,
    annual: 159,
    annualTotal: 1908,
    apps: "Unlimited apps",
    description: "For agencies and power users with no limits.",
    features: [
      "Unlimited AI-generated apps",
      "Hosting included",
      "Full app functionality",
      "Priority email support",
      "14-day free trial",
    ],
    highlight: false,
    badge: null,
  },
];

export default function PricingSection() {
  const [annual, setAnnual] = useState(false);

  return (
    <section id="pricing" className="py-20 px-4 bg-off-white">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-navy-dark">
            Simple, honest pricing
          </h2>
          <p className="mt-3 text-gray-600 text-lg">
            No setup fees. No hidden costs. Cancel anytime.
          </p>
          <p className="mt-1 text-gray-600 text-lg">
            Every plan is a flat rate — no credits, no usage meters, no surprise bills as your business grows.
          </p>

          {/* Toggle */}
          <div className="inline-flex items-center mt-8 bg-white border border-gray-200 rounded-xl p-1 shadow-sm">
            <button
              onClick={() => setAnnual(false)}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
                !annual
                  ? "bg-navy-dark text-white shadow-sm"
                  : "text-gray-500 hover:text-navy-dark"
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setAnnual(true)}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${
                annual
                  ? "bg-navy-dark text-white shadow-sm"
                  : "text-gray-500 hover:text-navy-dark"
              }`}
            >
              Annual
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                  annual
                    ? "bg-blue-500/30 text-blue-100"
                    : "bg-green-100 text-green-700"
                }`}
              >
                Save 20%
              </span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`relative rounded-2xl p-7 flex flex-col transition-all ${
                plan.highlight
                  ? "bg-navy-dark text-white shadow-2xl ring-2 ring-navy scale-[1.02]"
                  : "bg-white border border-gray-200 hover:border-navy hover:shadow-lg"
              }`}
            >
              {plan.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="bg-blue-500 text-white text-xs font-bold px-4 py-1.5 rounded-full shadow-lg whitespace-nowrap">
                    {plan.badge}
                  </span>
                </div>
              )}

              <div className="mb-6">
                <p
                  className={`text-xs font-bold uppercase tracking-widest mb-1 ${
                    plan.highlight ? "text-blue-300" : "text-navy"
                  }`}
                >
                  {plan.name}
                </p>
                <p
                  className={`text-sm mb-4 ${
                    plan.highlight ? "text-blue-200" : "text-gray-500"
                  }`}
                >
                  {plan.description}
                </p>

                <div className="flex items-end gap-1 mb-1">
                  <span className="text-5xl font-bold tracking-tight">
                    ${annual ? plan.annual : plan.monthly}
                  </span>
                  <span
                    className={`text-sm mb-2 ${
                      plan.highlight ? "text-blue-200" : "text-gray-500"
                    }`}
                  >
                    /mo
                  </span>
                </div>

                {annual ? (
                  <p
                    className={`text-xs mb-1 ${
                      plan.highlight ? "text-blue-300" : "text-green-600 font-medium"
                    }`}
                  >
                    Billed ${plan.annualTotal}/yr — you save $
                    {plan.monthly * 12 - plan.annualTotal}/yr
                  </p>
                ) : (
                  <p
                    className={`text-xs mb-1 ${
                      plan.highlight ? "text-blue-300" : "text-gray-400"
                    }`}
                  >
                    or ${plan.annual}/mo billed annually
                  </p>
                )}

                <p
                  className={`text-sm font-semibold mt-3 ${
                    plan.highlight ? "text-blue-200" : "text-navy"
                  }`}
                >
                  {plan.apps}
                </p>
              </div>

              <ul className="space-y-2.5 mb-8 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm">
                    <span
                      className={`mt-0.5 shrink-0 ${
                        plan.highlight ? "text-blue-300" : "text-navy"
                      }`}
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

              <Link
                href="/signup"
                className={`text-center font-semibold py-3.5 rounded-xl transition-all text-sm ${
                  plan.highlight
                    ? "bg-navy hover:bg-blue-600 text-white"
                    : "border-2 border-navy text-navy hover:bg-navy hover:text-white"
                }`}
              >
                Start Free Trial — 14 Days Free
              </Link>
            </div>
          ))}
        </div>

        <p className="text-center text-sm text-gray-400 mt-8">
          All plans include a 14-day free trial. No credit card required to
          start.
        </p>
      </div>
    </section>
  );
}
