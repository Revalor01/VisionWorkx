"use client";

import { useState } from "react";
import type { SocialBrand, SocialVideoAsset, SocialVideoStatus, SocialVideoProduct } from "@/lib/database.types";

const STATUS_LABEL: Record<SocialVideoStatus, string> = {
  raw: "Raw",
  in_editing: "In Editing",
  ready: "Ready",
  posted: "Posted",
  generating: "Generating…",
  failed: "Failed",
};

const STATUS_STYLE: Record<SocialVideoStatus, string> = {
  raw: "bg-slate-100 text-slate-600",
  in_editing: "bg-amber-100 text-amber-700",
  ready: "bg-green-100 text-green-700",
  posted: "bg-sky-100 text-sky-700",
  generating: "bg-purple-100 text-purple-700",
  failed: "bg-red-100 text-red-700",
};

// Matches lib/social/videoOutro.ts's BRAND_LOGOS keys — every identity in
// the product matrix now has a logo file to build an outro card from.
const OUTRO_APPS = [
  "VisionWorkx", "Revalor Kids", "Revalor Wellness", "Revalor LLC",
  "Chorebit", "FeelFlow", "MindBit", "Sanctum", "Proactive", "Revalor Consulting",
];

// Which product the video is actually promoting — distinct from the brand
// select above, which is the account/voice identity it's generated under
// (e.g. brand "Revalor LLC" can still be a video about the VisionWorkx
// product specifically). Mirrors LinkedInTab.tsx's PRODUCT_LABEL/product.
//
// The real brand/product matrix:
//   Revalor Business (brand) -> visionworkx, proactive, revalor_consulting
//   Revalor Kids (brand)     -> chorebit, feelflow, mindbit
//   Revalor Wellness (brand) -> sanctum
// "revalor" is a company-wide/no-specific-product option.
const PRODUCT_LABEL: Record<SocialVideoProduct, string> = {
  visionworkx: "VisionWorkx",
  proactive: "Proactive",
  revalor_consulting: "Revalor Consulting",
  chorebit: "Chorebit",
  feelflow: "FeelFlow",
  mindbit: "MindBit",
  sanctum: "Sanctum",
  revalor: "Revalor (company-wide)",
};

// Groups drive the <optgroup> layout in the product select below — purely
// visual, not tied to the actual brand_id select (whose options come from
// the real social_brands rows, which don't necessarily use these same
// names — see BrandsTab.tsx's BRAND_LOGOS keys for what those rows are
// really called).
const PRODUCT_GROUPS: { label: string; products: SocialVideoProduct[] }[] = [
  { label: "Revalor Business", products: ["visionworkx", "proactive", "revalor_consulting"] },
  { label: "Revalor Kids", products: ["chorebit", "feelflow", "mindbit"] },
  { label: "Revalor Wellness", products: ["sanctum"] },
  { label: "Other", products: ["revalor"] },
];

// A product auto-selects its matching outro app when one exists (same
// name, same logo) — still overridable via the Outro app select below.
const PRODUCT_TO_OUTRO_APP: Partial<Record<SocialVideoProduct, string>> = {
  visionworkx: "VisionWorkx",
  proactive: "Proactive",
  revalor_consulting: "Revalor Consulting",
  chorebit: "Chorebit",
  feelflow: "FeelFlow",
  mindbit: "MindBit",
  sanctum: "Sanctum",
};

const MIN_DURATION = 3;
const MAX_DURATION = 15;

const VIDEO_POLL_INTERVAL_MS = 4000;
const VIDEO_POLL_MAX_ATTEMPTS = 90; // ~6 min ceiling, above the route's own 5 min budget

export default function StudioTab({
  brands,
  videoAssets,
  setVideoAssets,
}: {
  brands: SocialBrand[];
  videoAssets: SocialVideoAsset[];
  setVideoAssets: React.Dispatch<React.SetStateAction<SocialVideoAsset[]>>;
}) {
  const [brandId, setBrandId] = useState(brands[0]?.id ?? "");
  const [product, setProduct] = useState<SocialVideoProduct>("visionworkx");
  const [prompt, setPrompt] = useState("");
  const [duration, setDuration] = useState(10);
  const [outroApp, setOutroApp] = useState<string>(PRODUCT_TO_OUTRO_APP.visionworkx ?? "none");
  const [suggesting, setSuggesting] = useState(false);
  const [suggestError, setSuggestError] = useState("");

  function handleProductChange(next: SocialVideoProduct) {
    setProduct(next);
    setOutroApp(PRODUCT_TO_OUTRO_APP[next] ?? "none");
  }

  async function suggestContent() {
    setSuggesting(true);
    setSuggestError("");
    try {
      const res = await fetch("/api/social/video-assets/studio-suggest-subject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setPrompt(body.subject);
    } catch (err) {
      setSuggestError((err as Error).message);
    } finally {
      setSuggesting(false);
    }
  }
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [previewLoading, setPreviewLoading] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<Record<string, string>>({});

  const studioVideos = videoAssets
    .filter((v) => v.origin === "studio")
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  function brandName(id: string) {
    return brands.find((b) => b.id === id)?.name ?? "—";
  }

  async function pollVideoAsset(assetId: string) {
    for (let attempt = 0; attempt < VIDEO_POLL_MAX_ATTEMPTS; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, VIDEO_POLL_INTERVAL_MS));
      const res = await fetch(`/api/social/video-assets/${assetId}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      const asset: SocialVideoAsset = body.asset;
      setVideoAssets((prev) => prev.map((v) => (v.id === asset.id ? asset : v)));
      if (asset.status === "ready") return;
      if (asset.status === "failed") throw new Error(asset.notes || "Video generation failed");
    }
    throw new Error("Still generating after several minutes — check back shortly, it should finish on its own");
  }

  async function handleGenerate() {
    if (!brandId || !prompt.trim()) {
      setError("Pick a brand and describe what the video should show");
      return;
    }
    setGenerating(true);
    setError("");
    try {
      const res = await fetch("/api/social/video-assets/studio-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId, product, prompt: prompt.trim(), durationSeconds: duration, outroApp }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setVideoAssets((prev) => [body.asset, ...prev]);
      await pollVideoAsset(body.asset.id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  async function togglePreview(asset: SocialVideoAsset) {
    const which = asset.final_path ? "final" : "raw";
    if (previewUrls[asset.id]) {
      setPreviewUrls((prev) => {
        const next = { ...prev };
        delete next[asset.id];
        return next;
      });
      return;
    }
    setPreviewLoading(asset.id);
    setPreviewError((prev) => ({ ...prev, [asset.id]: "" }));
    try {
      const res = await fetch(`/api/social/video-assets/${asset.id}/preview-url?which=${which}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setPreviewUrls((prev) => ({ ...prev, [asset.id]: body.url }));
    } catch (err) {
      setPreviewError((prev) => ({ ...prev, [asset.id]: (err as Error).message }));
    } finally {
      setPreviewLoading(null);
    }
  }

  return (
    <div>
      <div className="bg-white border border-green-600 rounded-xl p-5 mb-6">
        <h2 className="text-lg font-semibold text-[#1A3A5C] mb-1">Media Studio</h2>
        <p className="text-sm text-slate-500 mb-4">
          Create a standalone video — you write the prompt and pick the length, no post required. Every video made
          here is tagged so it shows up in the Content and LinkedIn tabs&apos; video pickers, and any social process
          can query for it directly.
        </p>
        {error && <div className="mb-3 p-2 rounded-lg bg-red-100 border border-red-300 text-red-700 text-sm">{error}</div>}

        <div className="flex flex-wrap gap-4 mb-3">
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs font-medium text-slate-500 mb-1">Product (what it's about)</label>
            <select
              value={product}
              onChange={(e) => handleProductChange(e.target.value as SocialVideoProduct)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            >
              {PRODUCT_GROUPS.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.products.map((p) => (
                    <option key={p} value={p}>{PRODUCT_LABEL[p]}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs font-medium text-slate-500 mb-1">Brand identity (voice/tone)</label>
            <select
              value={brandId}
              onChange={(e) => setBrandId(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            >
              {brands.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between mb-1">
          <label className="block text-xs font-medium text-slate-500">Describe what the video should show</label>
          {product !== "revalor" && (
            <button
              onClick={suggestContent}
              disabled={suggesting}
              className="text-xs font-medium text-purple-600 hover:underline disabled:opacity-50"
            >
              {suggesting ? "Thinking…" : "Suggest content ✨"}
            </button>
          )}
        </div>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={4}
          placeholder="e.g. A founder at a laptop reviewing a dashboard, confident and focused, warm morning light..."
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mb-1"
        />
        {suggestError && <p className="text-xs text-red-600 mb-3">{suggestError}</p>}
        <p className="text-[11px] text-slate-400 mb-3">
          &quot;Suggest content&quot; pulls a fresh, on-topic idea from {PRODUCT_LABEL[product]}&apos;s real feature set —
          edit it before generating, or write your own from scratch.
        </p>

        <div className="flex flex-wrap gap-4 mb-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Length (seconds)</label>
            <input
              type="number"
              min={MIN_DURATION}
              max={MAX_DURATION}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="w-24 border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
            <p className="text-[11px] text-slate-400 mt-1">{MIN_DURATION}-{MAX_DURATION}s (Kling v3.0)</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Outro app</label>
            <select
              value={outroApp}
              onChange={(e) => setOutroApp(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="none">None</option>
              {OUTRO_APPS.map((app) => (
                <option key={app} value={app}>{app}</option>
              ))}
            </select>
            <p className="text-[11px] text-slate-400 mt-1">Logo end-card, appended to the clip</p>
          </div>
        </div>

        <button
          onClick={handleGenerate}
          disabled={generating}
          className="text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 rounded-lg px-4 py-2 disabled:opacity-50"
        >
          {generating ? "Generating… (usually 2-4 min)" : "Generate video"}
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {studioVideos.map((asset) => (
          <div key={asset.id} className="bg-white border border-green-600 rounded-xl p-4">
            <div className="flex justify-between items-start mb-1">
              <span className="text-sm font-semibold text-[#1A3A5C]">
                {asset.studio_product ? PRODUCT_LABEL[asset.studio_product] : "—"}
              </span>
              <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${STATUS_STYLE[asset.status]}`}>
                {STATUS_LABEL[asset.status]}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mb-2">Brand: {brandName(asset.brand_id)}</p>
            <p className="text-xs text-slate-600 mb-2 line-clamp-3">{asset.studio_prompt}</p>
            <p className="text-[11px] text-slate-400 mb-2">
              {asset.studio_duration_seconds}s
              {asset.studio_outro_app && asset.studio_outro_app !== "none" ? ` · ${asset.studio_outro_app} outro` : ""}
            </p>
            {asset.status === "failed" && asset.notes && (
              <p className="text-xs text-red-600 mb-2">{asset.notes}</p>
            )}

            {(asset.status === "ready" || asset.status === "posted") && (
              <button
                onClick={() => togglePreview(asset)}
                disabled={previewLoading === asset.id}
                className="text-xs font-medium text-sky-600 hover:underline disabled:opacity-50 mb-2"
              >
                {previewLoading === asset.id ? "Loading…" : previewUrls[asset.id] ? "Hide preview" : "Preview video"}
              </button>
            )}
            {previewError[asset.id] && <p className="text-xs text-red-600 mb-2">{previewError[asset.id]}</p>}
            {previewUrls[asset.id] && (
              <video controls src={previewUrls[asset.id]} className="w-full rounded-lg bg-black" />
            )}
          </div>
        ))}
        {studioVideos.length === 0 && (
          <p className="text-sm text-slate-400 col-span-full">No Media Studio videos yet.</p>
        )}
      </div>
    </div>
  );
}
