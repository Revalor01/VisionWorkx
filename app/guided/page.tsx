"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase-browser";
import PasswordInput from "@/components/PasswordInput";

function GuidedForm() {
  const params = useSearchParams();
  const cancelled = params.get("cancelled") === "1";
  const compCode = params.get("comp") ?? "";
  const [form, setForm] = useState({
    fullName: "",
    businessName: "",
    businessType: "",
    email: "",
    password: "",
    description: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function set(k: keyof typeof form, v: string) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError("");

    const supabase = createBrowserClient();
    const { data, error: authError } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: { data: { full_name: form.fullName, company_name: form.businessName } },
    });
    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }
    if (!data.session) {
      // Email confirmation is on — account made, but no session to file the
      // request with yet. Tell them to confirm, then come back.
      setError(
        "Check your email to confirm your account, then come back to this page to finish your session request.",
      );
      setLoading(false);
      return;
    }

    const res = await fetch("/api/guided", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName: form.fullName,
        businessName: form.businessName,
        businessType: form.businessType,
        description: form.description,
        compCode: compCode || undefined,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok && json.comped) {
      window.location.href = "/guided/booked"; // tester — no payment
      return;
    }
    if (!res.ok || !json.url) {
      setError(json.error ?? "Something went wrong starting checkout.");
      setLoading(false);
      return;
    }
    window.location.href = json.url; // Stripe Checkout
  }

  const inputCls =
    "w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-transparent";

  return (
    <div className="min-h-screen bg-off-white flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="text-2xl font-bold text-navy-dark">
            Vision Workx
          </Link>
          <h1 className="text-2xl font-bold text-navy-dark mt-6">Guided Build Session</h1>
          <p className="text-gray-600 text-sm mt-1">
            $10 · credited to your first month. We work out your app and build it.
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          {cancelled && !error && (
            <div className="mb-4 p-3 rounded-lg bg-amber-50 text-amber-800 text-sm border border-amber-200">
              Payment was cancelled — your account is created, just finish checkout below to book.
            </div>
          )}
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm border border-red-200">
              {error}
            </div>
          )}

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-navy-dark mb-1.5">Your name</label>
              <input required value={form.fullName} onChange={(e) => set("fullName", e.target.value)} placeholder="Jane Smith" className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-navy-dark mb-1.5">Business name</label>
              <input required value={form.businessName} onChange={(e) => set("businessName", e.target.value)} placeholder="Green Blade Lawn Care" className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-navy-dark mb-1.5">What kind of business?</label>
              <input required value={form.businessType} onChange={(e) => set("businessType", e.target.value)} placeholder="Landscaping company" className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-navy-dark mb-1.5">Email</label>
              <input type="email" required value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="you@yourbusiness.com" className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-navy-dark mb-1.5">Password</label>
              <PasswordInput
                required
                minLength={8}
                value={form.password}
                onChange={(e) => set("password", e.target.value)}
                placeholder="At least 8 characters"
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-navy-dark mb-1.5">
                In a few sentences, what do you need it to do?
              </label>
              <textarea
                required
                rows={4}
                maxLength={1500}
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                placeholder="Describe it like you'd explain it to a friend — customers, bookings, payments, staff, whatever matters."
                className={inputCls}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-promote-gold hover:brightness-110 text-navy-dark font-bold py-3 rounded-xl shadow-lg shadow-promote-gold/20 transition-all disabled:opacity-40"
            >
              {loading ? "Booking…" : compCode ? "Book my session (comp — no charge)" : "Book my session — $10"}
            </button>
            <p className="text-center text-xs text-gray-400">
              Already have an account?{" "}
              <Link href="/login" className="text-navy underline">
                Log in
              </Link>{" "}
              first, then request from your dashboard.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function GuidedSessionPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-off-white" />}>
      <GuidedForm />
    </Suspense>
  );
}
