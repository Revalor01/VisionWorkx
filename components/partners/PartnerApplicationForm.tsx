"use client";

import { useRef, useState } from "react";
import {
  BUDGET_RANGE_OPTIONS,
  INDUSTRY_OPTIONS,
  REFERRAL_NETWORK_OPTIONS,
  SERVICES_OFFERED_OPTIONS,
  SOCIAL_REACH_OPTIONS,
} from "@/lib/partners/scoring";

const MAX_PHOTOS = 5;

interface FormState {
  businessName: string;
  ownerName: string;
  email: string;
  phone: string;
  industry: string;
  servicesOffered: string[];
  servicesOfferedOther: string;
  onlinePresenceUrl: string;
  budgetRange: string;
  socialReachRange: string;
  referralNetworkSize: string;
  whyPartner: string;
}

const DEFAULT_FORM: FormState = {
  businessName: "",
  ownerName: "",
  email: "",
  phone: "",
  industry: "",
  servicesOffered: [],
  servicesOfferedOther: "",
  onlinePresenceUrl: "",
  budgetRange: "",
  socialReachRange: "",
  referralNetworkSize: "",
  whyPartner: "",
};

export default function PartnerApplicationForm() {
  const [data, setData] = useState<FormState>(DEFAULT_FORM);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const photosInputRef = useRef<HTMLInputElement>(null);

  function update<K extends keyof FormState>(field: K, value: FormState[K]) {
    setData((prev) => ({ ...prev, [field]: value }));
  }

  function toggleService(value: string) {
    setData((prev) => ({
      ...prev,
      servicesOffered: prev.servicesOffered.includes(value)
        ? prev.servicesOffered.filter((s) => s !== value)
        : [...prev.servicesOffered, value],
    }));
  }

  function handlePhotosChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).slice(0, MAX_PHOTOS);
    setPhotoFiles(files);
  }

  const canSubmit =
    data.businessName.trim() !== "" &&
    data.ownerName.trim() !== "" &&
    data.email.trim() !== "" &&
    data.phone.trim() !== "" &&
    data.industry !== "" &&
    data.servicesOffered.length > 0 &&
    data.budgetRange !== "" &&
    data.socialReachRange !== "" &&
    data.referralNetworkSize !== "" &&
    data.whyPartner.trim() !== "";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || loading) return;
    setLoading(true);
    setError("");

    try {
      const formData = new FormData();
      formData.append("business_name", data.businessName);
      formData.append("owner_name", data.ownerName);
      formData.append("email", data.email);
      formData.append("phone", data.phone);
      formData.append("industry", data.industry);
      data.servicesOffered.forEach((s) => formData.append("services_offered", s));
      formData.append("services_offered_other", data.servicesOfferedOther);
      formData.append("online_presence_url", data.onlinePresenceUrl);
      formData.append("budget_range", data.budgetRange);
      formData.append("social_reach_range", data.socialReachRange);
      formData.append("referral_network_size", data.referralNetworkSize);
      formData.append("why_partner", data.whyPartner);
      formData.append("company_fax", ""); // honeypot — left blank by real users
      if (logoFile) formData.append("logo", logoFile);
      photoFiles.forEach((f) => formData.append("photos", f));

      const res = await fetch("/api/partners/apply", { method: "POST", body: formData });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }

      setSubmitted(true);
    } catch (err) {
      console.error("[partner application submit]", err);
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 text-center">
        <div className="text-3xl mb-3">✅</div>
        <h2 className="text-xl font-bold text-navy-dark mb-1">Application received</h2>
        <p className="text-gray-500 text-sm">
          Thanks, {data.businessName}. We review every application by hand and will follow up by email soon.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 space-y-6">
      {error && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
      )}

      {/* Honeypot — hidden from real users via CSS, bots that fill every field trip it */}
      <div className="hidden" aria-hidden="true">
        <label htmlFor="company_fax">Leave this field blank</label>
        <input id="company_fax" name="company_fax" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <Field label="Business name" required>
        <input
          type="text"
          value={data.businessName}
          onChange={(e) => update("businessName", e.target.value)}
          placeholder="Radiance Hair Studio"
          className={inputCls}
        />
      </Field>

      <Field label="Owner name" required>
        <input
          type="text"
          value={data.ownerName}
          onChange={(e) => update("ownerName", e.target.value)}
          placeholder="Jane Doe"
          className={inputCls}
        />
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Email" required>
          <input
            type="email"
            value={data.email}
            onChange={(e) => update("email", e.target.value)}
            placeholder="jane@radiancehair.com"
            className={inputCls}
          />
        </Field>
        <Field label="Phone" required>
          <input
            type="tel"
            value={data.phone}
            onChange={(e) => update("phone", e.target.value)}
            placeholder="(555) 123-4567"
            className={inputCls}
          />
        </Field>
      </div>

      <Field label="Industry" required>
        <select
          value={data.industry}
          onChange={(e) => update("industry", e.target.value)}
          className={inputCls}
        >
          <option value="">Select an industry…</option>
          {INDUSTRY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Services offered" required>
        <div className="space-y-2">
          {SERVICES_OFFERED_OPTIONS.map((o) => (
            <label
              key={o.value}
              className="flex items-center gap-3 p-2.5 rounded-xl border border-gray-200 hover:border-navy cursor-pointer transition-colors"
            >
              <input
                type="checkbox"
                checked={data.servicesOffered.includes(o.value)}
                onChange={() => toggleService(o.value)}
                className="accent-navy-dark w-4 h-4 shrink-0"
              />
              <span className="text-sm text-navy-dark">{o.label}</span>
            </label>
          ))}
        </div>
        {data.servicesOffered.includes("other") && (
          <input
            type="text"
            value={data.servicesOfferedOther}
            onChange={(e) => update("servicesOfferedOther", e.target.value)}
            placeholder="Tell us more about the other service(s)"
            className={`${inputCls} mt-2`}
          />
        )}
      </Field>

      <Field label="Current online presence">
        <input
          type="text"
          value={data.onlinePresenceUrl}
          onChange={(e) => update("onlinePresenceUrl", e.target.value)}
          placeholder="https://yourbusiness.com or 'none'"
          className={inputCls}
        />
      </Field>

      <Field label="Budget range" required>
        <select
          value={data.budgetRange}
          onChange={(e) => update("budgetRange", e.target.value)}
          className={inputCls}
        >
          <option value="">Select a budget range…</option>
          {BUDGET_RANGE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Social media reach" required>
          <select
            value={data.socialReachRange}
            onChange={(e) => update("socialReachRange", e.target.value)}
            className={inputCls}
          >
            <option value="">Select…</option>
            {SOCIAL_REACH_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Referral network size" required>
          <select
            value={data.referralNetworkSize}
            onChange={(e) => update("referralNetworkSize", e.target.value)}
            className={inputCls}
          >
            <option value="">Select…</option>
            {REFERRAL_NETWORK_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <p className="text-xs text-gray-400 -mt-3">
        Referral network = other businesses you could realistically introduce us to.
      </p>

      <Field label="Why do you want to partner with VisionWorkx?" required>
        <textarea
          value={data.whyPartner}
          onChange={(e) => update("whyPartner", e.target.value)}
          placeholder="Tell us about your business and why this partnership makes sense…"
          rows={4}
          className={`${inputCls} resize-none`}
        />
      </Field>

      <Field label="Logo (optional)">
        <input
          ref={logoInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
          className="text-sm"
        />
      </Field>

      <Field label={`Photos (optional, up to ${MAX_PHOTOS})`}>
        <input
          ref={photosInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          onChange={handlePhotosChange}
          className="text-sm"
        />
        {photoFiles.length > 0 && (
          <p className="text-xs text-gray-400 mt-1">{photoFiles.length} photo(s) selected</p>
        )}
      </Field>

      <button
        type="submit"
        disabled={!canSubmit || loading}
        className="w-full bg-navy-dark text-white font-semibold py-3 rounded-xl hover:bg-navy transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {loading ? "Submitting…" : "Submit Application →"}
      </button>
    </form>
  );
}

const inputCls =
  "w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-transparent";

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-navy-dark mb-1.5">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}
