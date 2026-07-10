"use client";

import { useMemo, useRef, useState } from "react";
import { createBrowserClient } from "@/lib/supabase-browser";
import type { SocialBrand, SocialVideoAsset, SocialVideoStatus } from "@/lib/database.types";

const STATUS_LABEL: Record<SocialVideoStatus, string> = {
  raw: "Raw",
  in_editing: "In Editing",
  ready: "Ready",
  posted: "Posted",
};

const STATUS_STYLE: Record<SocialVideoStatus, string> = {
  raw: "bg-gray-100 text-gray-600",
  in_editing: "bg-amber-100 text-amber-700",
  ready: "bg-green-100 text-green-700",
  posted: "bg-sky-100 text-sky-700",
};

export default function VideoTab({
  brands,
  videoAssets,
  setVideoAssets,
}: {
  brands: SocialBrand[];
  videoAssets: SocialVideoAsset[];
  setVideoAssets: React.Dispatch<React.SetStateAction<SocialVideoAsset[]>>;
}) {
  const supabase = useMemo(() => createBrowserClient(), []);
  const [brandId, setBrandId] = useState(brands[0]?.id ?? "");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const finalFileInputRef = useRef<Record<string, HTMLInputElement | null>>({});

  async function handleRawUpload(file: File) {
    if (!brandId) return;
    setUploading(true);
    setError("");
    try {
      const res = await fetch("/api/social/video-assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId, filename: file.name }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);

      const { error: uploadError } = await supabase.storage
        .from("social-video-assets")
        .uploadToSignedUrl(body.path, body.uploadToken, file);
      if (uploadError) throw new Error(uploadError.message);

      setVideoAssets((prev) => [body.asset, ...prev]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleFinalUpload(asset: SocialVideoAsset, file: File) {
    setError("");
    try {
      const res = await fetch(`/api/social/video-assets/${asset.id}/final-upload-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);

      const { error: uploadError } = await supabase.storage
        .from("social-video-assets")
        .uploadToSignedUrl(body.path, body.uploadToken, file);
      if (uploadError) throw new Error(uploadError.message);

      await updateAsset(asset.id, { status: "ready", finalPath: body.path });
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function updateAsset(id: string, patch: { status?: SocialVideoStatus; notes?: string; finalPath?: string }) {
    await fetch(`/api/social/video-assets/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    setVideoAssets((prev) =>
      prev.map((v) =>
        v.id === id
          ? { ...v, ...(patch.status ? { status: patch.status } : {}), ...(patch.finalPath ? { final_path: patch.finalPath } : {}) }
          : v
      )
    );
  }

  function brandName(id: string) {
    return brands.find((b) => b.id === id)?.name ?? "—";
  }

  return (
    <div>
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
        <h2 className="text-lg font-semibold text-[#1A3A5C] mb-3">Upload raw footage</h2>
        {error && <div className="mb-3 p-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}
        <div className="flex gap-3 items-center">
          <select value={brandId} onChange={(e) => setBrandId(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
            {brands.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
          <input
            ref={fileInputRef}
            type="file"
            accept="video/mp4,video/quicktime,video/x-m4v"
            onChange={(e) => e.target.files?.[0] && handleRawUpload(e.target.files[0])}
            disabled={uploading || !brandId}
            className="text-sm"
          />
          {uploading && <span className="text-sm text-gray-500">Uploading…</span>}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {videoAssets.map((asset) => (
          <div key={asset.id} className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex justify-between items-start mb-2">
              <span className="text-xs font-medium text-gray-500">{brandName(asset.brand_id)}</span>
              <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${STATUS_STYLE[asset.status]}`}>
                {STATUS_LABEL[asset.status]}
              </span>
            </div>
            <p className="text-xs text-gray-400 mb-3 font-mono">{asset.raw_path.split("/").pop()}</p>

            {asset.status !== "ready" && asset.status !== "posted" && (
              <div className="mb-2">
                <input
                  ref={(el) => { finalFileInputRef.current[asset.id] = el; }}
                  type="file"
                  accept="video/mp4,video/quicktime,video/x-m4v"
                  onChange={(e) => e.target.files?.[0] && handleFinalUpload(asset, e.target.files[0])}
                  className="text-xs w-full"
                />
                <p className="text-[11px] text-gray-400 mt-1">Upload finished edit to mark Ready</p>
              </div>
            )}

            <select
              value={asset.status}
              onChange={(e) => updateAsset(asset.id, { status: e.target.value as SocialVideoStatus })}
              className="w-full text-xs border border-gray-300 rounded-lg px-2 py-1.5"
            >
              {(Object.keys(STATUS_LABEL) as SocialVideoStatus[]).map((s) => (
                <option key={s} value={s}>{STATUS_LABEL[s]}</option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}
