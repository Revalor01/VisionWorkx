"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { AppCategory } from "@/lib/database.types";

const CATEGORIES: { id: AppCategory; title: string; desc: string }[] = [
  { id: "booking", title: "Booking & Scheduling", desc: "Online appointments, staff scheduling, a public booking page" },
  { id: "crm", title: "Customer CRM", desc: "Contacts, lead tracking, notes, follow-up reminders" },
  { id: "inventory", title: "Inventory & Orders", desc: "Stock tracking, orders, low-stock alerts" },
  { id: "portal", title: "Customer Portal", desc: "Client login, document sharing, messaging" },
  { id: "invoicing", title: "Invoicing & Quotes", desc: "Send quotes, invoice clients, collect payments" },
  { id: "membership", title: "Membership", desc: "Recurring billing, check-ins, plan tiers" },
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
  const [category, setCategory] = useState<AppCategory | null>(null);
  const [secondary, setSecondary] = useState<AppCategory[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function toggleSecondary(c: AppCategory) {
    setSecondary((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c].slice(0, 3),
    );
  }

  function set(k: keyof typeof form, v: string) {
    setForm((p) => ({ ...p, [k]: v }));
  }

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
          intake: {
            businessName: form.businessName,
            businessType: form.businessType,
            location: form.location,
            description: form.description,
            category,
            secondaryCategories: secondary.filter((c) => c !== category),
            features: [],
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
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-navy-dark">Your email</label>
          <input
            type="email"
            required
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
            placeholder="you@yourbusiness.com"
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

      <div>
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
              Need more in one app? Add capabilities (optional)
            </p>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.filter((c) => c.id !== category).map((c) => {
                const on = secondary.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggleSecondary(c.id)}
                    className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                      on
                        ? "border-navy bg-navy text-white"
                        : "border-gray-300 text-gray-600 hover:border-navy"
                    }`}
                  >
                    {on ? "✓ " : "+ "}
                    {c.title}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-navy-dark">
          Anything specific it needs? <span className="text-gray-400">(optional)</span>
        </label>
        <textarea
          rows={3}
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
          placeholder="e.g. customers should be able to pick a crew member, and I want a deposit taken at booking."
          className={inputCls}
        />
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={!category || !form.email || !form.businessName || !form.businessType || submitting}
        className="w-full rounded-xl bg-navy-dark py-3 font-semibold text-white transition-colors hover:bg-navy disabled:cursor-not-allowed disabled:opacity-40"
      >
        {submitting ? "Starting…" : "Build my app"}
      </button>
      <p className="text-center text-xs text-gray-400">
        Free preview · expires in 72 hours · no card required
      </p>
    </form>
  );
}
