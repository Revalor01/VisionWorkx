"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { AppCategory } from "@/lib/database.types";
import { TEAM_ACCESS_FEATURE } from "@/lib/features";
import BrandPreview from "@/components/BrandPreview";

const CATEGORIES: { id: AppCategory; title: string; desc: string }[] = [
  { id: "booking", title: "Booking & Scheduling", desc: "Online appointments, staff scheduling, a public booking page" },
  { id: "crm", title: "Customer CRM", desc: "Contacts, lead tracking, notes, follow-up reminders" },
  { id: "inventory", title: "Inventory & Orders", desc: "Stock tracking, orders, low-stock alerts" },
  { id: "portal", title: "Customer Portal", desc: "Client login, document sharing, messaging" },
  { id: "invoicing", title: "Invoicing & Quotes", desc: "Send quotes, invoice clients, collect payments" },
  { id: "membership", title: "Membership", desc: "Recurring billing, check-ins, plan tiers" },
  { id: "storefront", title: "Online Store", desc: "Product catalogue, cart, online checkout, orders" },
];

export default function TryForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [form, setForm] = useState({
    email: params.get("email") ?? "",
    businessName: "",
    businessType: "",
    location: "",
    description: "",
  });
  const [primaryColor, setPrimaryColor] = useState("#1A3A5C");
  const [backgroundColor, setBackgroundColor] = useState("#F8FAFC");
  const [showColors, setShowColors] = useState(false);
  const [category, setCategory] = useState<AppCategory | null>(null);
  const [secondary, setSecondary] = useState<AppCategory[]>([]);
  const [teamLogins, setTeamLogins] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [recommending, setRecommending] = useState(false);
  const [recError, setRecError] = useState("");
  const [rationale, setRationale] = useState("");

  function toggleSecondary(c: AppCategory) {
    setSecondary((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c].slice(0, 2),
    );
  }

  function set(k: keyof typeof form, v: string) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  async function recommend() {
    if (recommending) return;
    setRecommending(true);
    setRecError("");
    setRationale("");
    try {
      const res = await fetch("/api/try/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName: form.businessName,
          businessType: form.businessType,
          description: form.description,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRecError(data.error ?? "Couldn't get a recommendation.");
        return;
      }
      setCategory(data.category);
      setSecondary(Array.isArray(data.secondaryCategories) ? data.secondaryCategories : []);
      setTeamLogins(data.teamLogins === true);
      setRationale(typeof data.rationale === "string" ? data.rationale : "");
    } catch {
      setRecError("Network error — try again, or pick your app type below.");
    } finally {
      setRecommending(false);
    }
  }

  // Present -> test mode: full form + recommender, but /api/try stops
  // before the build. Handed out as /try?k=<code>.
  const testCode = params.get("k") ?? "";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!category || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/try", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.email,
          testCode: testCode || undefined,
          intake: {
            businessName: form.businessName,
            businessType: form.businessType,
            location: form.location,
            description: form.description,
            category,
            secondaryCategories: secondary.filter((c) => c !== category),
            features: teamLogins ? [TEAM_ACCESS_FEATURE] : [],
            primaryColor,
            backgroundColor,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      router.push(`/try/${data.token}`);
    } catch {
      setError("Network error — try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const inputCls =
    "w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-navy-dark placeholder:text-gray-400 focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy";

  return (
    <form onSubmit={submit} className="mt-8 space-y-6">
      {testCode && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          <span className="font-semibold">Test mode.</span> Walk through the whole form and the
          recommender — we&apos;ll stop before building anything. Nothing gets deployed.
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-navy-dark">Your email</label>
          <input
            type="email"
            required
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
            placeholder="you@gmail.com"
            className={inputCls}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-navy-dark">Business name</label>
          <input
            required
            value={form.businessName}
            onChange={(e) => set("businessName", e.target.value)}
            placeholder="Green Blade Lawn Care"
            className={inputCls}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-navy-dark">
            What kind of business?
          </label>
          <input
            required
            value={form.businessType}
            onChange={(e) => set("businessType", e.target.value)}
            placeholder="Landscaping company"
            className={inputCls}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-navy-dark">
            Location <span className="text-gray-400">(optional)</span>
          </label>
          <input
            value={form.location}
            onChange={(e) => set("location", e.target.value)}
            placeholder="Austin, TX"
            className={inputCls}
          />
        </div>
      </div>

      <div className="rounded-xl border border-navy/20 bg-navy/[0.03] p-4">
        <label className="mb-1 block text-sm font-medium text-navy-dark">
          In a sentence or two, what does this need to do?
        </label>
        <p className="mb-2 text-xs text-gray-500">
          Describe it like you&apos;d explain it to a friend — we&apos;ll suggest the setup. You can
          change anything after.
        </p>
        <textarea
          rows={3}
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
          placeholder="e.g. Customers should be able to book a crew online and pay a deposit, and my two crew leads need their own logins."
          className={inputCls}
        />
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={recommend}
            disabled={recommending || !form.businessType.trim() || form.description.trim().length < 10}
            className="rounded-lg border border-navy bg-white px-4 py-2 text-sm font-semibold text-navy transition-colors hover:bg-navy hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {recommending ? "Thinking…" : "✨ Recommend my setup"}
          </button>
          {recError && <span className="text-xs text-red-600">{recError}</span>}
        </div>
      </div>

      <div>
        {rationale && (
          <div className="mb-3 rounded-xl border border-navy/30 bg-navy/5 p-3 text-sm text-navy-dark">
            <span className="font-semibold">Based on that, we suggest the below.</span> {rationale}{" "}
            <span className="text-gray-500">Change anything that doesn&apos;t fit.</span>
          </div>
        )}
        <p className="mb-2 text-sm font-medium text-navy-dark">What should the app do?</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategory(c.id)}
              className={`rounded-xl border p-4 text-left transition-colors ${
                category === c.id
                  ? "border-navy bg-navy/5 ring-1 ring-navy"
                  : "border-gray-200 hover:border-navy"
              }`}
            >
              <p className="text-sm font-semibold text-navy-dark">{c.title}</p>
              <p className="mt-0.5 text-xs text-gray-500">{c.desc}</p>
            </button>
          ))}
        </div>

        {category && (
          <div className="mt-3">
            <p className="mb-1.5 text-xs text-gray-500">
              Need more in one app? Add up to 2 (optional) — each one makes the build bigger and
              slower.
            </p>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.filter((c) => c.id !== category).map((c) => {
                const on = secondary.includes(c.id);
                const atMax = secondary.length >= 2 && !on;
                return (
                  <button
                    key={c.id}
                    type="button"
                    disabled={atMax}
                    onClick={() => toggleSecondary(c.id)}
                    className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                      on
                        ? "border-navy bg-navy text-white"
                        : atMax
                          ? "border-gray-200 text-gray-300 cursor-not-allowed"
                          : "border-gray-300 text-gray-600 hover:border-navy"
                    }`}
                  >
                    {on ? "✓ " : "+ "}
                    {c.title}
                  </button>
                );
              })}
            </div>
            {secondary.length >= 2 && (
              <p className="mt-2 text-xs text-amber-600">
                That&apos;s the max — a bigger build takes longer and can time out. You can add more
                later by describing the change in plain English.
              </p>
            )}
          </div>
        )}

        {category && (
          <label className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-xl border border-gray-200 p-3 text-sm hover:border-navy">
            <input
              type="checkbox"
              checked={teamLogins}
              onChange={(e) => setTeamLogins(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-navy focus:ring-navy"
            />
            <span>
              <span className="font-medium text-navy-dark">
                My staff will need their own logins
              </span>
              <span className="mt-0.5 block text-xs text-gray-500">
                Adds a Team page where you invite staff by link and control who can
                see the admin area.
              </span>
            </span>
          </label>
        )}
      </div>

      <div className="rounded-xl border border-navy/20 bg-navy/[0.03] p-4">
        {!showColors ? (
          <button
            type="button"
            onClick={() => setShowColors(true)}
            className="text-sm font-semibold text-navy hover:underline"
          >
            + Pick your colors <span className="font-normal text-gray-500">(optional)</span>
          </button>
        ) : (
          <div className="space-y-3">
            <p className="text-sm font-medium text-navy-dark">Colors</p>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm text-gray-600">
                <input
                  type="color"
                  value={backgroundColor}
                  onChange={(e) => setBackgroundColor(e.target.value)}
                  className="h-10 w-10 cursor-pointer rounded-lg border border-gray-300 p-0.5"
                />
                Background
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-600">
                <input
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="h-10 w-10 cursor-pointer rounded-lg border border-gray-300 p-0.5"
                />
                Buttons &amp; accents
              </label>
            </div>
            <BrandPreview
              primary={primaryColor}
              background={backgroundColor}
              businessName={form.businessName}
            />
            <p className="text-xs text-gray-400">You can fine-tune or change these anytime after.</p>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={!category || !form.email || !form.businessName || !form.businessType || submitting}
        className="w-full rounded-xl bg-promote-gold py-3 font-bold text-navy-dark shadow-lg shadow-promote-gold/20 transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
      >
        {submitting ? "Starting…" : testCode ? "Run test (no build)" : "Build my app"}
      </button>
      <p className="text-center text-xs text-gray-400">
        {testCode
          ? "Test run · nothing is built or deployed"
          : "Free preview · expires in 72 hours · no card required"}
      </p>
    </form>
  );
}
