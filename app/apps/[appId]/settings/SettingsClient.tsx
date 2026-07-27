"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import AppNavbar from "@/components/nav/AppNavbar";
import { createBrowserClient } from "@/lib/supabase-browser";
import { uploadLogo } from "@/lib/uploadLogo";
import type { Plan } from "@/lib/database.types";

const SOCIAL_PLATFORMS: { key: string; label: string; placeholder: string }[] = [
  { key: "instagram", label: "Instagram", placeholder: "https://instagram.com/yourbusiness" },
  { key: "facebook", label: "Facebook", placeholder: "https://facebook.com/yourbusiness" },
  { key: "tiktok", label: "TikTok", placeholder: "https://tiktok.com/@yourbusiness" },
  { key: "twitter", label: "X / Twitter", placeholder: "https://x.com/yourbusiness" },
  { key: "linkedin", label: "LinkedIn", placeholder: "https://linkedin.com/company/yourbusiness" },
  { key: "youtube", label: "YouTube", placeholder: "https://youtube.com/@yourbusiness" },
];

export default function SettingsClient({
  appId,
  appName,
  userId,
  userName,
  userEmail,
  plan,
  initialSettings,
  unavailable,
  colorsUnavailable,
}: {
  appId: string;
  appName: string;
  userId: string;
  userName: string | null;
  userEmail: string | null;
  plan: Plan;
  initialSettings: {
    logo_url: string | null;
    social_links: Record<string, string>;
    primary_color?: string | null;
    background_color?: string | null;
  } | null;
  unavailable: boolean;
  colorsUnavailable: boolean;
}) {
  const supabase = useMemo(() => createBrowserClient(), []);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(
    initialSettings?.logo_url ?? null
  );
  const [logoRemoved, setLogoRemoved] = useState(false);
  const [socialLinks, setSocialLinks] = useState<Record<string, string>>(
    initialSettings?.social_links ?? {}
  );
  const [primaryColor, setPrimaryColor] = useState(
    initialSettings?.primary_color ?? "#1A3A5C"
  );
  const [backgroundColor, setBackgroundColor] = useState(
    initialSettings?.background_color ?? "#F8FAFC"
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setLogoFile(file);
    setLogoRemoved(false);
    setSaved(false);
    if (file) {
      setLogoPreview(URL.createObjectURL(file));
    } else {
      setLogoPreview(null);
    }
  }

  function handleRemoveLogo() {
    setLogoFile(null);
    setLogoPreview(null);
    setLogoRemoved(true);
    setSaved(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function updateSocialLink(key: string, value: string) {
    setSaved(false);
    setSocialLinks((prev) => {
      const next = { ...prev };
      if (value.trim()) next[key] = value.trim();
      else delete next[key];
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    setSaved(false);

    try {
      let logoPath: string | null | undefined = undefined;
      if (logoFile) {
        logoPath = await uploadLogo(supabase, userId, logoFile);
        if (!logoPath) throw new Error("Logo upload failed. Please try again.");
      } else if (logoRemoved) {
        logoPath = null;
      }

      const res = await fetch(`/api/apps/${appId}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(logoPath !== undefined ? { logoPath } : {}),
          socialLinks,
          ...(colorsUnavailable ? {} : { primaryColor, backgroundColor }),
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }

      setSaved(true);
      setLogoRemoved(false);
      setLogoFile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-off-white flex flex-col">
      <AppNavbar userName={userName} plan={plan} userEmail={userEmail} />

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-10">
        <div className="mb-6">
          <Link href="/dashboard" className="text-sm text-navy hover:underline">
            ← Back to Dashboard
          </Link>
        </div>

        <h1 className="text-2xl font-bold text-navy-dark mb-1">App Settings</h1>
        <p className="text-gray-500 text-sm mb-8">{appName}</p>

        {unavailable ? (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-sm text-amber-800">
            Settings aren&apos;t available for this app yet — it was deployed before this feature
            shipped. Re-save it from the{" "}
            <Link href={`/onboard?edit=${appId}`} className="underline font-medium">
              Edit
            </Link>{" "}
            flow to enable it (this will regenerate and redeploy your app).
          </div>
        ) : (
          <div className="space-y-8">
            {error && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
                {error}
              </div>
            )}
            {saved && (
              <div className="p-3 rounded-xl bg-green-50 border border-green-200 text-green-700 text-sm">
                Saved — your live app will reflect these changes right away, no redeploy needed.
              </div>
            )}

            <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
              <h2 className="font-semibold text-navy-dark mb-4">Logo</h2>
              <div className="flex items-center gap-4">
                {logoPreview ? (
                  <div className="relative w-16 h-16 rounded-xl border border-gray-200 overflow-hidden bg-gray-50">
                    <Image
                      src={logoPreview}
                      alt="Logo preview"
                      fill
                      className="object-contain p-1"
                      unoptimized
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
                      onClick={handleRemoveLogo}
                      className="ml-2 text-sm text-red-500 hover:underline"
                    >
                      Remove
                    </button>
                  )}
                  <p className="text-xs text-gray-400 mt-1">PNG, JPG, WebP or SVG · Max 5 MB</p>
                </div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                onChange={handleLogoChange}
                className="hidden"
              />
            </section>

            {!colorsUnavailable && (
              <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
                <h2 className="font-semibold text-navy-dark mb-4">Brand Colors</h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-navy-dark mb-2">
                      Primary color
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={primaryColor}
                        onChange={(e) => {
                          setPrimaryColor(e.target.value);
                          setSaved(false);
                        }}
                        className="w-12 h-12 rounded-xl border border-gray-300 cursor-pointer p-0.5"
                      />
                      <span className="text-sm text-gray-600 font-mono">
                        {primaryColor.toUpperCase()}
                      </span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-navy-dark mb-2">
                      Background color
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={backgroundColor}
                        onChange={(e) => {
                          setBackgroundColor(e.target.value);
                          setSaved(false);
                        }}
                        className="w-12 h-12 rounded-xl border border-gray-300 cursor-pointer p-0.5"
                      />
                      <span className="text-sm text-gray-600 font-mono">
                        {backgroundColor.toUpperCase()}
                      </span>
                    </div>
                  </div>
                </div>
              </section>
            )}

            <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
              <h2 className="font-semibold text-navy-dark mb-1">Social Media Links</h2>
              <p className="text-xs text-gray-400 mb-4">
                Leave a field blank to hide it — only links you add here show up on your live app.
              </p>
              <div className="space-y-3">
                {SOCIAL_PLATFORMS.map((platform) => (
                  <div key={platform.key}>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      {platform.label}
                    </label>
                    <input
                      type="url"
                      value={socialLinks[platform.key] ?? ""}
                      onChange={(e) => updateSocialLink(platform.key, e.target.value)}
                      placeholder={platform.placeholder}
                      className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-transparent"
                    />
                  </div>
                ))}
              </div>
            </section>

            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="w-full bg-navy-dark text-white font-semibold py-3 rounded-xl hover:bg-navy transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
