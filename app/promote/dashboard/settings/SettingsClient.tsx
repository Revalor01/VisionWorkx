"use client";

import { useState } from "react";
import type { PromoteBusiness, PromotePlan, PromoteSubscription, PromoteService } from "@/lib/database.types";

const TABS = ["Profile", "Business", "Billing", "Integrations"] as const;
type Tab = (typeof TABS)[number];

const PLAN_DETAILS: { id: PromotePlan; label: string; price: string; features: string[] }[] = [
  { id: "starter", label: "Starter", price: "$19/mo", features: ["10 creatives/month", "Meta publishing", "Basic analytics"] },
  { id: "growth", label: "Growth", price: "$49/mo", features: ["Unlimited creatives", "Meta + Google", "Full analytics", "Priority support"] },
  { id: "pro", label: "Pro", price: "$99/mo", features: ["Everything in Growth", "Video ad support", "White-label reports", "API access"] },
];

export default function SettingsClient({
  userEmail,
  business,
  subscription,
}: {
  userEmail: string;
  business: PromoteBusiness | null;
  subscription: PromoteSubscription | null;
}) {
  const [tab, setTab] = useState<Tab>("Profile");
  const [form, setForm] = useState<PromoteBusiness | null>(business);
  const [saving, setSaving] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState<PromotePlan | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);

  const isActive = subscription?.status === "active" || subscription?.status === "trialing";

  async function saveBusiness() {
    if (!form) return;
    setSaving(true);
    try {
      await fetch("/api/promote/business/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          businessType: form.business_type,
          phone: form.phone ?? undefined,
          email: form.email ?? undefined,
          address: form.address ?? undefined,
          city: form.city ?? undefined,
          state: form.state ?? undefined,
          zipCode: form.zip_code ?? undefined,
          description: form.description ?? undefined,
          logoUrl: form.logo_url ?? undefined,
          photoUrls: form.photo_urls,
          services: form.services,
          brandColor: form.brand_color,
          bookingUrl: form.booking_url ?? undefined,
          websiteUrl: form.website_url ?? undefined,
        }),
      });
    } finally {
      setSaving(false);
    }
  }

  async function startCheckout(plan: PromotePlan) {
    setCheckoutLoading(plan);
    try {
      const res = await fetch("/api/promote/billing/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const body = await res.json();
      if (body.url) window.location.href = body.url;
    } finally {
      setCheckoutLoading(null);
    }
  }

  async function openPortal() {
    setPortalLoading(true);
    try {
      const res = await fetch("/api/promote/billing/portal", { method: "POST" });
      const body = await res.json();
      if (body.url) window.location.href = body.url;
    } finally {
      setPortalLoading(false);
    }
  }

  function updateService(index: number, field: keyof PromoteService, value: string | number) {
    if (!form) return;
    setForm({ ...form, services: form.services.map((s, i) => (i === index ? { ...s, [field]: value } : s)) });
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Settings</h1>

      <div className="flex gap-2 mb-6 border-b border-promote-border">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t ? "border-promote-accent text-promote-text" : "border-transparent text-promote-muted"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Profile" && (
        <div className="max-w-md space-y-4">
          <Field label="Email"><input value={userEmail} disabled className={`${inputCls} opacity-60`} /></Field>
          <p className="text-xs text-promote-muted">Password changes are managed from your main VisionWorkx account settings.</p>
        </div>
      )}

      {tab === "Business" && form && (
        <div className="max-w-md space-y-4">
          <Field label="Business name"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} /></Field>
          <Field label="Business type"><input value={form.business_type} onChange={(e) => setForm({ ...form, business_type: e.target.value })} className={inputCls} /></Field>
          <Field label="Phone"><input value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputCls} /></Field>
          <Field label="Booking URL"><input value={form.booking_url ?? ""} onChange={(e) => setForm({ ...form, booking_url: e.target.value })} className={inputCls} /></Field>
          <Field label="Brand color">
            <input type="color" value={form.brand_color} onChange={(e) => setForm({ ...form, brand_color: e.target.value })} className="w-12 h-12 rounded-xl border border-promote-border bg-transparent p-0.5" />
          </Field>
          <div>
            <label className="block text-sm font-medium mb-2">Services</label>
            <div className="space-y-2">
              {form.services.map((s, i) => (
                <div key={i} className="grid grid-cols-3 gap-2">
                  <input value={s.name} onChange={(e) => updateService(i, "name", e.target.value)} className={inputCls} />
                  <input type="number" value={s.price} onChange={(e) => updateService(i, "price", Number(e.target.value))} className={inputCls} />
                  <input type="number" value={s.duration} onChange={(e) => updateService(i, "duration", Number(e.target.value))} className={inputCls} />
                </div>
              ))}
            </div>
          </div>
          <button onClick={saveBusiness} disabled={saving} className="px-5 py-3 rounded-xl bg-promote-accent text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60">
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      )}

      {tab === "Billing" && (
        <div>
          <div className="mb-6 p-4 bg-promote-bg2 border border-promote-border rounded-xl max-w-md">
            <p className="text-sm text-promote-muted">Current plan</p>
            <p className="text-lg font-bold capitalize">{isActive ? subscription?.plan : "Free"}</p>
            {isActive && (
              <button onClick={openPortal} disabled={portalLoading} className="mt-2 text-sm text-promote-accent hover:underline">
                {portalLoading ? "Loading…" : "Manage billing →"}
              </button>
            )}
          </div>

          <div className="grid grid-cols-3 gap-4 max-w-3xl">
            {PLAN_DETAILS.map((p) => (
              <div key={p.id} className="bg-promote-bg2 border border-promote-border rounded-xl p-5">
                <p className="font-bold">{p.label}</p>
                <p className="text-2xl font-bold mt-1 mb-3">{p.price}</p>
                <ul className="text-xs text-promote-muted space-y-1 mb-4">
                  {p.features.map((f) => (
                    <li key={f}>&middot; {f}</li>
                  ))}
                </ul>
                <button
                  onClick={() => startCheckout(p.id)}
                  disabled={checkoutLoading === p.id || subscription?.plan === p.id}
                  className="w-full py-2.5 rounded-xl bg-promote-accent text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {subscription?.plan === p.id ? "Current plan" : checkoutLoading === p.id ? "Loading…" : "Choose plan"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "Integrations" && (
        <div className="max-w-md space-y-4">
          <div className="p-4 bg-promote-bg2 border border-promote-border rounded-xl">
            <p className="font-medium">Meta Ads</p>
            <p className="text-xs text-promote-muted mt-1">Coming soon — pending Meta advertising API approval.</p>
          </div>
          <div className="p-4 bg-promote-bg2 border border-promote-border rounded-xl">
            <p className="font-medium">Google Ads</p>
            <p className="text-xs text-promote-muted mt-1">Coming soon — pending Google Ads API approval.</p>
          </div>
        </div>
      )}
    </div>
  );
}

const inputCls =
  "w-full bg-promote-bg3 border border-promote-border rounded-xl px-4 py-2.5 text-sm text-promote-text focus:outline-none focus:ring-2 focus:ring-promote-accent focus:border-transparent";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1.5">{label}</label>
      {children}
    </div>
  );
}
