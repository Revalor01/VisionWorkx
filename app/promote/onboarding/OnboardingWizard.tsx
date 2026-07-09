"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase-browser";
import type { PromoteService } from "@/lib/database.types";

const TOTAL_STEPS = 4;

const BUSINESS_TYPES = [
  "Barbershop / Salon",
  "Beauty / Nail Salon",
  "Gym / Fitness Studio",
  "Yoga / Pilates",
  "Restaurant",
  "Café",
  "Auto Repair",
  "Plumber",
  "Electrician",
  "Painter / Contractor",
  "Cleaning Service",
  "Pet Grooming",
  "Dentist",
  "Tutoring / Coaching",
  "Florist",
  "Other",
];

interface FormState {
  name: string;
  businessType: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  brandColor: string;
  description: string;
  services: PromoteService[];
  bookingUrl: string;
  websiteUrl: string;
}

const DEFAULT_FORM: FormState = {
  name: "",
  businessType: BUSINESS_TYPES[0],
  phone: "",
  email: "",
  address: "",
  city: "",
  state: "",
  zipCode: "",
  brandColor: "#4f8ef7",
  description: "",
  services: [{ name: "", price: 0, duration: 30 }],
  bookingUrl: "",
  websiteUrl: "",
};

export default function OnboardingWizard({ userId }: { userId: string }) {
  const router = useRouter();
  const supabase = useMemo(() => createBrowserClient(), []);

  const [step, setStep] = useState(1);
  const [data, setData] = useState<FormState>(DEFAULT_FORM);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const logoInputRef = useRef<HTMLInputElement>(null);
  const photosInputRef = useRef<HTMLInputElement>(null);

  function update<K extends keyof FormState>(field: K, value: FormState[K]) {
    setData((prev) => ({ ...prev, [field]: value }));
  }

  function updateService(index: number, field: keyof PromoteService, value: string | number) {
    setData((prev) => ({
      ...prev,
      services: prev.services.map((s, i) => (i === index ? { ...s, [field]: value } : s)),
    }));
  }

  function addService() {
    setData((prev) => ({ ...prev, services: [...prev.services, { name: "", price: 0, duration: 30 }] }));
  }

  function removeService(index: number) {
    setData((prev) => ({ ...prev, services: prev.services.filter((_, i) => i !== index) }));
  }

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setLogoFile(file);
    setLogoPreview(file ? URL.createObjectURL(file) : null);
  }

  function handlePhotosChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).slice(0, 5);
    setPhotoFiles(files);
  }

  async function uploadToPromoteAssets(file: File, subfolder: string): Promise<string | null> {
    const ext = file.name.split(".").pop() ?? "png";
    const path = `${userId}/${subfolder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("promote-assets")
      .upload(path, file, { upsert: false });
    if (uploadError) {
      console.error("[promote upload]", uploadError.message);
      return null;
    }
    const { data: publicUrl } = supabase.storage.from("promote-assets").getPublicUrl(path);
    return publicUrl.publicUrl;
  }

  async function handleSubmit() {
    setLoading(true);
    setError("");

    try {
      const [logoUrl, photoUrls] = await Promise.all([
        logoFile ? uploadToPromoteAssets(logoFile, "logo") : Promise.resolve(null),
        Promise.all(photoFiles.map((f) => uploadToPromoteAssets(f, "photos"))),
      ]);

      const res = await fetch("/api/promote/business/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name,
          businessType: data.businessType,
          phone: data.phone || undefined,
          email: data.email || undefined,
          address: data.address || undefined,
          city: data.city || undefined,
          state: data.state || undefined,
          zipCode: data.zipCode || undefined,
          description: data.description || undefined,
          logoUrl: logoUrl || undefined,
          photoUrls: photoUrls.filter((u): u is string => Boolean(u)),
          services: data.services.filter((s) => s.name.trim()),
          brandColor: data.brandColor,
          bookingUrl: data.bookingUrl || undefined,
          websiteUrl: data.websiteUrl || undefined,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }

      router.push("/promote/dashboard");
    } catch (err) {
      console.error("[promote onboarding submit]", err);
      setError("Something went wrong saving your business. Please try again.");
      setLoading(false);
    }
  }

  const progress = (step / TOTAL_STEPS) * 100;
  const canAdvance =
    (step === 1 && data.name.trim() !== "" && data.businessType.trim() !== "") ||
    step === 2 ||
    (step === 3 && data.services.some((s) => s.name.trim())) ||
    step === 4;

  return (
    <div className="min-h-screen bg-promote-bg text-promote-text flex flex-col">
      <header className="border-b border-promote-border px-6 py-4">
        <span className="font-bold text-lg">
          VisionWorkx <span className="text-promote-accent">Promote</span>
        </span>
      </header>

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-10">
        <div className="mb-8">
          <div className="flex justify-between text-xs text-promote-muted mb-2">
            <span>Step {step} of {TOTAL_STEPS}</span>
            <span>{Math.round(progress)}% complete</span>
          </div>
          <div className="w-full bg-promote-bg3 rounded-full h-2">
            <div
              className="bg-promote-accent h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <div className="bg-promote-bg2 rounded-2xl border border-promote-border p-8">
          {error && (
            <div className="mb-5 p-3 rounded-xl bg-promote-red/10 border border-promote-red/30 text-promote-red text-sm">
              {error}
            </div>
          )}

          {step === 1 && (
            <div>
              <h2 className="text-xl font-bold mb-1">Tell us about your business</h2>
              <p className="text-promote-muted text-sm mb-6">This becomes the foundation for every ad we generate.</p>
              <div className="space-y-4">
                <Field label="Business name" required>
                  <input value={data.name} onChange={(e) => update("name", e.target.value)} placeholder="Marcus's Barbershop" className={inputCls} />
                </Field>
                <Field label="Business type" required>
                  <select value={data.businessType} onChange={(e) => update("businessType", e.target.value)} className={inputCls}>
                    {BUSINESS_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </Field>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Phone"><input value={data.phone} onChange={(e) => update("phone", e.target.value)} placeholder="(555) 123-4567" className={inputCls} /></Field>
                  <Field label="Business email"><input value={data.email} onChange={(e) => update("email", e.target.value)} placeholder="marcus@example.com" className={inputCls} /></Field>
                </div>
                <Field label="Address"><input value={data.address} onChange={(e) => update("address", e.target.value)} placeholder="142 Main Street" className={inputCls} /></Field>
                <div className="grid grid-cols-3 gap-4">
                  <Field label="City"><input value={data.city} onChange={(e) => update("city", e.target.value)} className={inputCls} /></Field>
                  <Field label="State"><input value={data.state} onChange={(e) => update("state", e.target.value)} className={inputCls} /></Field>
                  <Field label="ZIP"><input value={data.zipCode} onChange={(e) => update("zipCode", e.target.value)} className={inputCls} /></Field>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <h2 className="text-xl font-bold mb-1">Brand assets</h2>
              <p className="text-promote-muted text-sm mb-6">Used directly in your generated ad creatives.</p>
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium mb-2">Logo (optional)</label>
                  <div className="flex items-center gap-4">
                    {logoPreview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={logoPreview} alt="Logo preview" className="w-16 h-16 rounded-xl border border-promote-border object-contain bg-promote-bg3" />
                    ) : (
                      <div className="w-16 h-16 rounded-xl border-2 border-dashed border-promote-border flex items-center justify-center text-2xl">🖼️</div>
                    )}
                    <button type="button" onClick={() => logoInputRef.current?.click()} className="text-sm font-medium text-promote-accent border border-promote-accent px-4 py-2 rounded-xl hover:bg-promote-accent/10 transition-colors">
                      {logoPreview ? "Change logo" : "Upload logo"}
                    </button>
                  </div>
                  <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={handleLogoChange} className="hidden" />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Business photos (up to 5)</label>
                  <button type="button" onClick={() => photosInputRef.current?.click()} className="text-sm font-medium text-promote-accent border border-promote-accent px-4 py-2 rounded-xl hover:bg-promote-accent/10 transition-colors">
                    {photoFiles.length > 0 ? `${photoFiles.length} photo(s) selected` : "Upload photos"}
                  </button>
                  <input ref={photosInputRef} type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={handlePhotosChange} className="hidden" />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Brand color</label>
                  <div className="flex items-center gap-3">
                    <input type="color" value={data.brandColor} onChange={(e) => update("brandColor", e.target.value)} className="w-12 h-12 rounded-xl border border-promote-border cursor-pointer p-0.5 bg-transparent" />
                    <span className="text-sm text-promote-muted font-mono">{data.brandColor.toUpperCase()}</span>
                  </div>
                </div>

                <Field label="Short description (used in ad copy)">
                  <textarea value={data.description} onChange={(e) => update("description", e.target.value.slice(0, 200))} rows={3} maxLength={200} placeholder="Premium cuts and fades for the modern gentleman." className={`${inputCls} resize-none`} />
                </Field>
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <h2 className="text-xl font-bold mb-1">Services</h2>
              <p className="text-promote-muted text-sm mb-6">Ad copy references these directly.</p>
              <div className="space-y-3">
                {data.services.map((service, i) => (
                  <div key={i} className="grid grid-cols-[1fr_100px_100px_auto] gap-2 items-center">
                    <input value={service.name} onChange={(e) => updateService(i, "name", e.target.value)} placeholder="Fade" className={inputCls} />
                    <input type="number" value={service.price} onChange={(e) => updateService(i, "price", Number(e.target.value))} placeholder="$" className={inputCls} />
                    <input type="number" value={service.duration} onChange={(e) => updateService(i, "duration", Number(e.target.value))} placeholder="min" className={inputCls} />
                    <button type="button" onClick={() => removeService(i)} disabled={data.services.length === 1} className="text-promote-red text-sm disabled:opacity-30">Remove</button>
                  </div>
                ))}
                <button type="button" onClick={addService} className="text-sm text-promote-accent hover:underline">+ Add another service</button>
              </div>
            </div>
          )}

          {step === 4 && (
            <div>
              <h2 className="text-xl font-bold mb-1">Digital presence</h2>
              <p className="text-promote-muted text-sm mb-6">Ads will point customers here — the more specific, the better they convert.</p>
              <div className="space-y-4">
                <Field label="VisionWorkx booking URL (recommended)"><input value={data.bookingUrl} onChange={(e) => update("bookingUrl", e.target.value)} placeholder="https://your-app.vercel.app" className={inputCls} /></Field>
                <Field label="Website URL (optional)"><input value={data.websiteUrl} onChange={(e) => update("websiteUrl", e.target.value)} placeholder="https://yourbusiness.com" className={inputCls} /></Field>
              </div>
              <div className="mt-6 p-4 bg-promote-accent/10 border border-promote-accent/30 rounded-xl text-sm">
                <strong>What happens next:</strong> we&apos;ll save your business profile. From your dashboard you can generate AI ad copy + creative images and build a campaign right away.
              </div>
            </div>
          )}

          <div className="mt-8 flex gap-3">
            {step > 1 && (
              <button type="button" onClick={() => setStep((s) => s - 1)} disabled={loading} className="px-5 py-3 rounded-xl border border-promote-border text-sm font-medium hover:bg-promote-bg3 transition-colors disabled:opacity-50">
                Back
              </button>
            )}
            {step < TOTAL_STEPS ? (
              <button type="button" onClick={() => setStep((s) => s + 1)} disabled={!canAdvance} className="flex-1 bg-promote-accent text-white font-semibold py-3 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed">
                Next
              </button>
            ) : (
              <button type="button" onClick={handleSubmit} disabled={loading} className="flex-1 bg-promote-accent text-white font-semibold py-3 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed">
                {loading ? "Saving…" : "Finish setup →"}
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

const inputCls =
  "w-full bg-promote-bg3 border border-promote-border rounded-xl px-4 py-3 text-sm text-promote-text focus:outline-none focus:ring-2 focus:ring-promote-accent focus:border-transparent placeholder:text-promote-muted";

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1.5">
        {label}
        {required && <span className="text-promote-red ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}
