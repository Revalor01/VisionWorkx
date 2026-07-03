"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import AppNavbar from "@/components/nav/AppNavbar";
import { createBrowserClient } from "@/lib/supabase-browser";
import type { AppCategory, IntakeData, Plan } from "@/lib/database.types";

const CATEGORIES: {
  id: AppCategory;
  icon: string;
  title: string;
  desc: string;
}[] = [
  {
    id: "booking",
    icon: "📅",
    title: "Booking & Scheduling",
    desc: "Online appointments, staff scheduling, public booking page",
  },
  {
    id: "crm",
    icon: "👥",
    title: "Customer CRM",
    desc: "Contact list, lead tracking, notes, follow-up reminders",
  },
  {
    id: "inventory",
    icon: "📦",
    title: "Inventory & Orders",
    desc: "Stock tracking, order management, low-stock alerts",
  },
  {
    id: "portal",
    icon: "🔐",
    title: "Customer Portal",
    desc: "Client login, document sharing, progress tracking",
  },
];

const FEATURES_BY_CATEGORY: Record<AppCategory, string[]> = {
  booking: [
    "Online appointment booking",
    "Staff / resource scheduling",
    "Public booking page",
    "Email confirmations",
    "SMS reminders",
    "Admin dashboard",
    "Calendar integration",
  ],
  crm: [
    "Contact management",
    "Lead pipeline",
    "Notes & activity log",
    "Follow-up reminders",
    "Email history",
    "Import / export contacts",
    "Tags & segments",
  ],
  inventory: [
    "Stock tracking",
    "Order management",
    "Low-stock alerts",
    "Supplier contacts",
    "Barcode scanning",
    "Purchase orders",
    "Sales reports",
  ],
  portal: [
    "Client login",
    "Document sharing",
    "Progress tracking",
    "Secure messaging",
    "File uploads",
    "Invoice viewing",
    "Notifications",
  ],
};

const FONTS = ["Inter", "Lato", "Roboto", "Playfair Display", "Montserrat"];

const TOTAL_STEPS = 5;

const CATEGORY_LABEL: Record<AppCategory, string> = {
  booking: "Booking App",
  crm: "CRM",
  inventory: "Inventory App",
  portal: "Customer Portal",
};

interface FormState extends Omit<IntakeData, "features"> {
  features: string[];
}

const DEFAULT_FORM: FormState = {
  businessName: "",
  businessType: "",
  location: "",
  description: "",
  category: "booking",
  features: [],
  primaryColor: "#1A3A5C",
  font: "Inter",
};

export default function OnboardForm({
  userId,
  userName,
  plan,
}: {
  userId: string;
  userName: string | null;
  plan: Plan;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createBrowserClient(), []);

  const [step, setStep] = useState(1);
  const [data, setData] = useState<FormState>(DEFAULT_FORM);
  const [categorySelected, setCategorySelected] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  function update<K extends keyof FormState>(field: K, value: FormState[K]) {
    setData((prev) => ({ ...prev, [field]: value }));
  }

  function toggleFeature(feature: string) {
    setData((prev) => ({
      ...prev,
      features: prev.features.includes(feature)
        ? prev.features.filter((f) => f !== feature)
        : [...prev.features, feature],
    }));
  }

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setLogoFile(file);
    if (file) {
      const url = URL.createObjectURL(file);
      setLogoPreview(url);
    } else {
      setLogoPreview(null);
    }
  }

  async function uploadLogo(): Promise<string | null> {
    if (!logoFile) return null;

    const ext = logoFile.name.split(".").pop() ?? "png";
    const path = `${userId}/${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("logos")
      .upload(path, logoFile, { upsert: false });

    if (uploadError) {
      console.error("[logo upload]", uploadError.message);
      return null;
    }

    return path;
  }

  async function handleGenerate() {
    if (!data.category) return;
    setLoading(true);
    setError("");

    try {
      const logoPath = await uploadLogo();

      const intake: IntakeData = {
        businessName: data.businessName,
        businessType: data.businessType,
        location: data.location,
        description: data.description,
        category: data.category,
        features: data.features,
        primaryColor: data.primaryColor,
        font: data.font,
        ...(logoPath ? { logoPath } : {}),
      };

      const res = await fetch("/api/apps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(intake),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }

      const { appId } = await res.json();
      router.push(`/generate?appId=${appId}`);
    } catch (err) {
      console.error("[onboard submit]", err);
      setError("Something went wrong saving your details. Please try again.");
      setLoading(false);
    }
  }

  const progress = (step / TOTAL_STEPS) * 100;

  const canAdvance =
    (step === 1 && data.businessName.trim() !== "" && data.businessType.trim() !== "") ||
    (step === 2 && categorySelected) ||
    step === 3 ||
    step === 4;

  return (
    <div className="min-h-screen bg-off-white flex flex-col">
      <AppNavbar userName={userName} plan={plan} />

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-10">
        {/* Progress bar */}
        <div className="mb-8">
          <div className="flex justify-between text-xs text-gray-500 mb-2">
            <span>Step {step} of {TOTAL_STEPS}</span>
            <span>{Math.round(progress)}% complete</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-navy-dark h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
          {error && (
            <div className="mb-5 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* ── Step 1 — Business details ── */}
          {step === 1 && (
            <div>
              <h2 className="text-xl font-bold text-navy-dark mb-1">
                Tell us about your business
              </h2>
              <p className="text-gray-500 text-sm mb-6">
                This helps us build an app that fits your exact needs.
              </p>
              <div className="space-y-4">
                <Field label="Business name" required>
                  <input
                    type="text"
                    value={data.businessName}
                    onChange={(e) => update("businessName", e.target.value)}
                    placeholder="Radiance Hair Studio"
                    className={inputCls}
                  />
                </Field>
                <Field label="Business type" required>
                  <input
                    type="text"
                    value={data.businessType}
                    onChange={(e) => update("businessType", e.target.value)}
                    placeholder="e.g. Hair salon, Consultant, Gym"
                    className={inputCls}
                  />
                </Field>
                <Field label="Location">
                  <input
                    type="text"
                    value={data.location}
                    onChange={(e) => update("location", e.target.value)}
                    placeholder="Austin, TX"
                    className={inputCls}
                  />
                </Field>
                <Field label="Describe your business (optional)">
                  <textarea
                    value={data.description}
                    onChange={(e) => update("description", e.target.value)}
                    placeholder="We're a full-service salon with 4 stylists, open Mon–Sat…"
                    rows={3}
                    className={`${inputCls} resize-none`}
                  />
                </Field>
              </div>
            </div>
          )}

          {/* ── Step 2 — App category ── */}
          {step === 2 && (
            <div>
              <h2 className="text-xl font-bold text-navy-dark mb-1">
                What kind of app do you need?
              </h2>
              <p className="text-gray-500 text-sm mb-6">
                Pick the category that best fits your business.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => {
                      update("category", cat.id);
                      update("features", []);
                      setCategorySelected(true);
                    }}
                    className={`text-left p-5 rounded-2xl border-2 transition-all ${
                      data.category === cat.id && categorySelected
                        ? "border-navy-dark bg-blue-50"
                        : "border-gray-200 hover:border-navy"
                    }`}
                  >
                    <div className="text-2xl mb-2">{cat.icon}</div>
                    <p className="font-semibold text-navy-dark text-sm mb-1">
                      {cat.title}
                    </p>
                    <p className="text-xs text-gray-500">{cat.desc}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Step 3 — Feature selection ── */}
          {step === 3 && data.category && (
            <div>
              <h2 className="text-xl font-bold text-navy-dark mb-1">
                Choose your features
              </h2>
              <p className="text-gray-500 text-sm mb-6">
                Select everything you want included in your app.
              </p>
              <div className="space-y-2">
                {FEATURES_BY_CATEGORY[data.category].map((feature) => (
                  <label
                    key={feature}
                    className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 hover:border-navy cursor-pointer transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={data.features.includes(feature)}
                      onChange={() => toggleFeature(feature)}
                      className="accent-navy-dark w-4 h-4 shrink-0"
                    />
                    <span className="text-sm text-navy-dark">{feature}</span>
                  </label>
                ))}
              </div>
              {data.features.length === 0 && (
                <p className="mt-3 text-xs text-amber-600">
                  Select at least one feature to continue.
                </p>
              )}
            </div>
          )}

          {/* ── Step 4 — Branding ── */}
          {step === 4 && (
            <div>
              <h2 className="text-xl font-bold text-navy-dark mb-1">
                Brand your app
              </h2>
              <p className="text-gray-500 text-sm mb-6">
                Make it look and feel like your business.
              </p>
              <div className="space-y-7">
                {/* Logo upload */}
                <div>
                  <label className="block text-sm font-medium text-navy-dark mb-2">
                    Logo (optional)
                  </label>
                  <div className="flex items-center gap-4">
                    {logoPreview ? (
                      <div className="relative w-16 h-16 rounded-xl border border-gray-200 overflow-hidden bg-gray-50">
                        <Image
                          src={logoPreview}
                          alt="Logo preview"
                          fill
                          className="object-contain p-1"
                        />
                      </div>
                    ) : (
                      <div className="w-16 h-16 rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center text-2xl bg-gray-50">
                        🖼️
                      </div>
                    )}
                    <div>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="text-sm font-medium text-navy border border-navy px-4 py-2 rounded-xl hover:bg-blue-50 transition-colors"
                      >
                        {logoPreview ? "Change logo" : "Upload logo"}
                      </button>
                      {logoPreview && (
                        <button
                          type="button"
                          onClick={() => {
                            setLogoFile(null);
                            setLogoPreview(null);
                            if (fileInputRef.current) fileInputRef.current.value = "";
                          }}
                          className="ml-2 text-sm text-red-500 hover:underline"
                        >
                          Remove
                        </button>
                      )}
                      <p className="text-xs text-gray-400 mt-1">
                        PNG, JPG, WebP or SVG · Max 5 MB
                      </p>
                    </div>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    onChange={handleLogoChange}
                    className="hidden"
                  />
                </div>

                {/* Primary color */}
                <div>
                  <label className="block text-sm font-medium text-navy-dark mb-2">
                    Primary color
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={data.primaryColor}
                      onChange={(e) => update("primaryColor", e.target.value)}
                      className="w-12 h-12 rounded-xl border border-gray-300 cursor-pointer p-0.5"
                    />
                    <span className="text-sm text-gray-600 font-mono">
                      {data.primaryColor.toUpperCase()}
                    </span>
                  </div>
                </div>

                {/* Font */}
                <div>
                  <label className="block text-sm font-medium text-navy-dark mb-2">
                    Font preference
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {FONTS.map((font) => (
                      <button
                        key={font}
                        type="button"
                        onClick={() => update("font", font)}
                        className={`py-2.5 px-4 rounded-xl border text-sm transition-all ${
                          data.font === font
                            ? "border-navy-dark bg-blue-50 font-semibold text-navy-dark"
                            : "border-gray-200 text-gray-700 hover:border-navy"
                        }`}
                        style={{ fontFamily: font }}
                      >
                        {font}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Step 5 — Review ── */}
          {step === 5 && (
            <div>
              <h2 className="text-xl font-bold text-navy-dark mb-1">
                Review & generate
              </h2>
              <p className="text-gray-500 text-sm mb-6">
                Everything look good? Hit generate and we&apos;ll build your
                app.
              </p>
              <div className="space-y-3">
                <ReviewRow
                  label="Business"
                  value={`${data.businessName} · ${data.businessType}`}
                />
                {data.location && (
                  <ReviewRow label="Location" value={data.location} />
                )}
                <ReviewRow
                  label="App type"
                  value={
                    CATEGORIES.find((c) => c.id === data.category)?.title ?? ""
                  }
                />
                <ReviewRow
                  label="Features"
                  value={
                    data.features.length > 0
                      ? data.features.join(", ")
                      : "None selected"
                  }
                />
                <ReviewRow
                  label="Branding"
                  value={
                    <span className="flex items-center gap-2">
                      <span
                        className="w-4 h-4 rounded-full border border-gray-300 inline-block shrink-0"
                        style={{ background: data.primaryColor }}
                      />
                      {data.primaryColor.toUpperCase()} · {data.font}
                      {logoFile && (
                        <span className="text-green-600 ml-1">· Logo ✓</span>
                      )}
                    </span>
                  }
                />
              </div>

              <div className="mt-6 p-4 bg-blue-50 border border-blue-100 rounded-xl text-sm text-navy-dark">
                <strong>What happens next:</strong> Our AI will generate a
                complete Next.js + Supabase app based on your inputs. This takes
                2–5 minutes. You&apos;ll get a live URL when it&apos;s done.
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="mt-8 flex gap-3">
            {step > 1 && (
              <button
                type="button"
                onClick={() => setStep((s) => s - 1)}
                disabled={loading}
                className="px-5 py-3 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Back
              </button>
            )}

            {step < TOTAL_STEPS ? (
              <button
                type="button"
                onClick={() => setStep((s) => s + 1)}
                disabled={!canAdvance}
                className="flex-1 bg-navy-dark text-white font-semibold py-3 rounded-xl hover:bg-navy transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next
              </button>
            ) : (
              <button
                type="button"
                onClick={handleGenerate}
                disabled={loading}
                className="flex-1 bg-navy-dark text-white font-semibold py-3 rounded-xl hover:bg-navy transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <span className="animate-spin">⚙️</span> Saving &amp;
                    starting…
                  </>
                ) : (
                  "Generate My App →"
                )}
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
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

function ReviewRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex gap-3 p-3 rounded-xl bg-off-white border border-gray-100">
      <span className="text-xs font-semibold text-gray-500 w-20 shrink-0 pt-0.5 uppercase tracking-wide">
        {label}
      </span>
      <span className="text-sm text-navy-dark">{value}</span>
    </div>
  );
}
