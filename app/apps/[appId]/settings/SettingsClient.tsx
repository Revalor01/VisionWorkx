"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import AppNavbar from "@/components/nav/AppNavbar";
import { createBrowserClient } from "@/lib/supabase-browser";
import { uploadLogo } from "@/lib/uploadLogo";
import {
  GALLERY_PHOTOS_BUCKET,
  MAX_GALLERY_PHOTOS,
  galleryPhotoPathToUrl,
  galleryPhotoUrlToPath,
  uploadGalleryPhoto,
} from "@/lib/uploadGalleryPhoto";
import type { AppCategory, AutomationWorkflow, Plan } from "@/lib/database.types";

const SOCIAL_PLATFORMS: { key: string; label: string; placeholder: string }[] = [
  { key: "instagram", label: "Instagram", placeholder: "https://instagram.com/yourbusiness" },
  { key: "facebook", label: "Facebook", placeholder: "https://facebook.com/yourbusiness" },
  { key: "tiktok", label: "TikTok", placeholder: "https://tiktok.com/@yourbusiness" },
  { key: "twitter", label: "X / Twitter", placeholder: "https://x.com/yourbusiness" },
  { key: "linkedin", label: "LinkedIn", placeholder: "https://linkedin.com/company/yourbusiness" },
  { key: "youtube", label: "YouTube", placeholder: "https://youtube.com/@yourbusiness" },
];

// The action engine only supports these two trigger/action pairs today (see
// revalor-automation/lib/actions.mjs) — one per category. Extend this map
// if/when more automations ship rather than building a generic list UI now.
const AUTOMATION_BY_CATEGORY: Partial<
  Record<AppCategory, { trigger: string; action: string; label: string; description: string }>
> = {
  booking: {
    trigger: "booking.created",
    action: "send_confirmation_email",
    label: "Booking confirmation emails",
    description: "Automatically email customers a confirmation as soon as they book.",
  },
  crm: {
    trigger: "lead.created",
    action: "send_lead_acknowledgment",
    label: "Lead acknowledgment emails",
    description: "Automatically email new leads a quick acknowledgment when they reach out.",
  },
};

export default function SettingsClient({
  appId,
  appName,
  appCategory,
  userId,
  userName,
  userEmail,
  plan,
  initialSettings,
  initialWorkflows,
  automationUsage,
  unavailable,
  colorsUnavailable,
  galleryUnavailable,
}: {
  appId: string;
  appName: string;
  appCategory: AppCategory;
  userId: string;
  userName: string | null;
  userEmail: string | null;
  plan: Plan;
  initialSettings: {
    logo_url: string | null;
    social_links: Record<string, string>;
    primary_color?: string | null;
    background_color?: string | null;
    gallery_photos?: string[];
  } | null;
  initialWorkflows: AutomationWorkflow[];
  automationUsage: { sent: number; limit: number };
  unavailable: boolean;
  colorsUnavailable: boolean;
  galleryUnavailable: boolean;
}) {
  const supabase = useMemo(() => createBrowserClient(), []);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const automation = AUTOMATION_BY_CATEGORY[appCategory];
  const [workflows, setWorkflows] = useState<AutomationWorkflow[]>(initialWorkflows);
  const [automationSaving, setAutomationSaving] = useState(false);
  const [automationError, setAutomationError] = useState("");
  const automationEnabled =
    automation &&
    (workflows.find(
      (w) => w.trigger_type === automation.trigger && w.action_type === automation.action
    )?.enabled ??
      false);

  async function toggleAutomation(nextEnabled: boolean) {
    if (!automation) return;
    setAutomationSaving(true);
    setAutomationError("");

    const { data, error } = await supabase
      .from("automation_workflows")
      .upsert(
        {
          app_id: appId,
          trigger_type: automation.trigger,
          action_type: automation.action,
          enabled: nextEnabled,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "app_id,trigger_type,action_type" }
      )
      .select()
      .single();

    if (error) {
      setAutomationError(error.message);
    } else if (data) {
      setWorkflows((prev) => [
        ...prev.filter((w) => w.id !== data.id),
        data as AutomationWorkflow,
      ]);
    }
    setAutomationSaving(false);
  }

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
  const [galleryPhotos, setGalleryPhotos] = useState<string[]>(
    initialSettings?.gallery_photos ?? []
  );
  const [galleryNewFiles, setGalleryNewFiles] = useState<File[]>([]);
  const [galleryRemovedUrls, setGalleryRemovedUrls] = useState<string[]>([]);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const totalGalleryCount = galleryPhotos.length + galleryNewFiles.length;
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

  function handleGalleryFilesChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    const room = MAX_GALLERY_PHOTOS - totalGalleryCount;
    setGalleryNewFiles((prev) => [...prev, ...files.slice(0, room)]);
    setSaved(false);
    e.target.value = "";
  }

  function handleRemoveExistingPhoto(url: string) {
    setGalleryPhotos((prev) => prev.filter((u) => u !== url));
    setGalleryRemovedUrls((prev) => [...prev, url]);
    setSaved(false);
  }

  function handleRemovePendingPhoto(index: number) {
    setGalleryNewFiles((prev) => prev.filter((_, i) => i !== index));
    setSaved(false);
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

      // Upload new gallery photos before the PATCH, and only delete removed
      // ones after it succeeds — so a failed PATCH never loses a photo the
      // user wanted to keep, and a failed delete just leaves a harmless
      // orphan (the DB, the render source of truth, is already correct).
      let uploadedUrls: string[] = [];
      if (galleryNewFiles.length > 0) {
        const results = await Promise.all(
          galleryNewFiles.map((file, i) => uploadGalleryPhoto(supabase, userId, file, i))
        );
        if (results.some((p) => p === null)) {
          throw new Error("One or more photo uploads failed. Please try again.");
        }
        uploadedUrls = (results as string[]).map(galleryPhotoPathToUrl);
      }
      const finalGalleryPhotos = [...galleryPhotos, ...uploadedUrls];

      const res = await fetch(`/api/apps/${appId}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(logoPath !== undefined ? { logoPath } : {}),
          socialLinks,
          ...(colorsUnavailable ? {} : { primaryColor, backgroundColor }),
          ...(galleryUnavailable ? {} : { galleryPhotos: finalGalleryPhotos }),
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }

      if (galleryRemovedUrls.length > 0) {
        const paths = galleryRemovedUrls
          .map(galleryPhotoUrlToPath)
          .filter((p): p is string => p !== null);
        if (paths.length > 0) {
          const { error: removeError } = await supabase.storage
            .from(GALLERY_PHOTOS_BUCKET)
            .remove(paths);
          if (removeError) console.error("[gallery photo delete]", removeError.message);
        }
      }
      setGalleryPhotos(finalGalleryPhotos);
      setGalleryNewFiles([]);
      setGalleryRemovedUrls([]);

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

            {automation && (
              <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
                <h2 className="font-semibold text-navy-dark mb-1">Automations</h2>
                <p className="text-xs text-gray-400 mb-4">
                  Automated emails triggered by activity on your live app — no redeploy needed to
                  change these.
                </p>
                {automationError && (
                  <p className="text-xs text-red-600 mb-3">{automationError}</p>
                )}
                <div className="flex items-center justify-between gap-3 bg-gray-50 border border-gray-100 rounded-xl px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-navy-dark">{automation.label}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{automation.description}</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={automationEnabled}
                    disabled={automationSaving}
                    onClick={() => toggleAutomation(!automationEnabled)}
                    className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
                      automationEnabled ? "bg-green-500" : "bg-gray-300"
                    }`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                        automationEnabled ? "translate-x-[18px]" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
                <p
                  className={`text-xs mt-3 ${
                    automationUsage.sent >= automationUsage.limit * 0.8
                      ? "text-amber-700"
                      : "text-gray-400"
                  }`}
                >
                  {automationUsage.sent} / {automationUsage.limit} sent this month
                  {automationUsage.sent >= automationUsage.limit && (
                    <>
                      {" "}
                      — limit reached, sends are paused until next month.{" "}
                      <Link href="/billing" className="font-semibold underline">
                        Upgrade
                      </Link>{" "}
                      to send more.
                    </>
                  )}
                  {automationUsage.sent >= automationUsage.limit * 0.8 &&
                    automationUsage.sent < automationUsage.limit && (
                      <>
                        {" "}
                        — approaching your monthly limit.{" "}
                        <Link href="/billing" className="font-semibold underline">
                          Upgrade
                        </Link>{" "}
                        for more.
                      </>
                    )}
                </p>
              </section>
            )}

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

            {!galleryUnavailable && (
              <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
                <div className="flex items-center justify-between mb-1">
                  <h2 className="font-semibold text-navy-dark">Photo Gallery</h2>
                  <span className="text-xs text-gray-400">
                    {totalGalleryCount} / {MAX_GALLERY_PHOTOS}
                  </span>
                </div>
                <p className="text-xs text-gray-400 mb-4">
                  Showcase recent work on your homepage — up to {MAX_GALLERY_PHOTOS} photos.
                </p>
                {totalGalleryCount > 0 && (
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    {galleryPhotos.map((url) => (
                      <div
                        key={url}
                        className="relative aspect-square rounded-xl border border-gray-200 overflow-hidden bg-gray-50"
                      >
                        <Image src={url} alt="Gallery photo" fill className="object-cover" unoptimized />
                        <button
                          type="button"
                          onClick={() => handleRemoveExistingPhoto(url)}
                          aria-label="Remove photo"
                          className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white text-sm flex items-center justify-center hover:bg-black/80 transition-colors"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    {galleryNewFiles.map((file, index) => (
                      <div
                        key={`${file.name}-${index}`}
                        className="relative aspect-square rounded-xl border border-gray-200 overflow-hidden bg-gray-50"
                      >
                        <Image
                          src={URL.createObjectURL(file)}
                          alt="Pending gallery photo"
                          fill
                          className="object-cover"
                          unoptimized
                        />
                        <button
                          type="button"
                          onClick={() => handleRemovePendingPhoto(index)}
                          aria-label="Remove photo"
                          className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white text-sm flex items-center justify-center hover:bg-black/80 transition-colors"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => galleryInputRef.current?.click()}
                  disabled={totalGalleryCount >= MAX_GALLERY_PHOTOS}
                  className="text-sm font-medium text-navy border border-navy px-4 py-2 rounded-xl hover:bg-blue-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                >
                  Add photos
                </button>
                <input
                  ref={galleryInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  multiple
                  onChange={handleGalleryFilesChange}
                  className="hidden"
                />
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
