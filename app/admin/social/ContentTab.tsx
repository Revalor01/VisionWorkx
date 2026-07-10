"use client";

import { useState } from "react";
import type { SocialBrand, SocialContent, SocialContentStatus, SocialPlatform, SocialVideoAsset } from "@/lib/database.types";

const STATUS_STYLE: Record<SocialContentStatus, string> = {
  draft: "bg-gray-100 text-gray-600",
  approved: "bg-sky-100 text-sky-700",
  scheduled: "bg-amber-100 text-amber-700",
  posted: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
};

export default function ContentTab({
  brands,
  content,
  setContent,
  videoAssets,
}: {
  brands: SocialBrand[];
  content: SocialContent[];
  setContent: React.Dispatch<React.SetStateAction<SocialContent[]>>;
  videoAssets: SocialVideoAsset[];
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [brandId, setBrandId] = useState(brands[0]?.id ?? "");
  const [platforms, setPlatforms] = useState<SocialPlatform[]>(["facebook", "instagram"]);
  const [postCount, setPostCount] = useState(7);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | SocialContentStatus>("all");
  const [scheduleDrafts, setScheduleDrafts] = useState<Record<string, string>>({});

  function togglePlatform(p: SocialPlatform) {
    setPlatforms((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  }

  async function handleGenerate() {
    if (!brandId || platforms.length === 0) {
      setError("Pick a brand and at least one platform");
      return;
    }
    setGenerating(true);
    setError("");
    try {
      const res = await fetch("/api/social/content/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId, platforms, postCount }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setContent((prev) => [...body.content, ...prev]);
      setModalOpen(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  async function linkVideoAsset(id: string, videoAssetId: string) {
    await fetch(`/api/social/content/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoAssetId: videoAssetId || null }),
    });
    setContent((prev) => prev.map((c) => (c.id === id ? { ...c, video_asset_id: videoAssetId || null } : c)));
  }

  async function updateStatus(id: string, status: SocialContentStatus, scheduledAt?: string) {
    await fetch(`/api/social/content/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, ...(scheduledAt ? { scheduledAt } : {}) }),
    });
    setContent((prev) =>
      prev.map((c) => (c.id === id ? { ...c, status, scheduled_at: scheduledAt ?? c.scheduled_at } : c))
    );
  }

  async function deleteContent(id: string) {
    await fetch(`/api/social/content/${id}`, { method: "DELETE" });
    setContent((prev) => prev.filter((c) => c.id !== id));
  }

  function brandName(id: string) {
    return brands.find((b) => b.id === id)?.name ?? "—";
  }

  const filtered = content.filter((c) => statusFilter === "all" || c.status === statusFilter);

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-[#1A3A5C]">Content Calendar</h2>
        <button
          onClick={() => setModalOpen(true)}
          disabled={brands.length === 0}
          className="px-4 py-2 rounded-lg bg-[#1A3A5C] text-white text-sm font-medium hover:bg-[#15304a] transition-colors disabled:opacity-40"
        >
          Generate Content
        </button>
      </div>

      <div className="flex gap-2 mb-4">
        {(["all", "draft", "approved", "scheduled", "posted", "failed"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium capitalize transition-colors ${
              statusFilter === s ? "bg-[#1A3A5C] text-white" : "bg-white border border-gray-200 text-gray-600"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-300 rounded-xl p-10 text-center text-gray-400 text-sm">
          No content{statusFilter !== "all" ? ` with status "${statusFilter}"` : ""} yet.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((c) => (
            <div key={c.id} className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-gray-500">{brandName(c.brand_id)}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 capitalize">{c.platform}</span>
                  <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${STATUS_STYLE[c.status]}`}>
                    {c.status}
                  </span>
                </div>
                <button onClick={() => deleteContent(c.id)} className="text-xs text-red-500 hover:underline">
                  Delete
                </button>
              </div>
              {c.hook && <p className="font-medium text-sm text-[#1A3A5C] mb-1">{c.hook}</p>}
              <p className="text-sm text-gray-700 whitespace-pre-wrap mb-2">{c.caption}</p>
              {c.hashtags.length > 0 && (
                <p className="text-xs text-gray-400 mb-3">{c.hashtags.map((h) => `#${h}`).join(" ")}</p>
              )}
              {c.status === "failed" && c.failure_reason && (
                <p className="text-xs text-red-600 mb-2">Failed: {c.failure_reason}</p>
              )}

              {c.platform === "instagram" && (c.status === "draft" || c.status === "approved") && (
                <div className="mb-2">
                  <label className="text-xs text-gray-500 mr-2">Video asset (required for Instagram):</label>
                  <select
                    value={c.video_asset_id ?? ""}
                    onChange={(e) => linkVideoAsset(c.id, e.target.value)}
                    className="text-xs border border-gray-300 rounded-lg px-2 py-1"
                  >
                    <option value="">— none —</option>
                    {videoAssets
                      .filter((v) => v.brand_id === c.brand_id && v.status === "ready")
                      .map((v) => (
                        <option key={v.id} value={v.id}>{v.id.slice(0, 8)} ({v.status})</option>
                      ))}
                  </select>
                </div>
              )}

              <div className="flex items-center gap-2 flex-wrap">
                {c.status === "draft" && (
                  <button onClick={() => updateStatus(c.id, "approved")} className="text-xs font-medium text-sky-700 hover:underline">
                    Approve
                  </button>
                )}
                {(c.status === "approved" || c.status === "draft") && (
                  <>
                    <input
                      type="datetime-local"
                      value={scheduleDrafts[c.id] ?? ""}
                      onChange={(e) => setScheduleDrafts((prev) => ({ ...prev, [c.id]: e.target.value }))}
                      className="text-xs border border-gray-300 rounded-lg px-2 py-1"
                    />
                    <button
                      onClick={() => scheduleDrafts[c.id] && updateStatus(c.id, "scheduled", new Date(scheduleDrafts[c.id]).toISOString())}
                      disabled={!scheduleDrafts[c.id]}
                      className="text-xs font-medium text-amber-700 hover:underline disabled:opacity-40"
                    >
                      Schedule
                    </button>
                  </>
                )}
                {c.status === "scheduled" && c.scheduled_at && (
                  <span className="text-xs text-gray-500">Scheduled for {new Date(c.scheduled_at).toLocaleString()}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <h3 className="text-lg font-bold text-[#1A3A5C] mb-4">Generate content</h3>
            {error && <div className="mb-3 p-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}

            <label className="block text-xs font-medium text-gray-500 mb-1">Brand</label>
            <select value={brandId} onChange={(e) => setBrandId(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4">
              {brands.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>

            <label className="block text-xs font-medium text-gray-500 mb-1">Platforms</label>
            <div className="flex gap-2 mb-4">
              {(["facebook", "instagram"] as SocialPlatform[]).map((p) => (
                <button
                  key={p}
                  onClick={() => togglePlatform(p)}
                  className={`px-3 py-1.5 rounded-lg text-sm capitalize border transition-colors ${
                    platforms.includes(p) ? "border-[#1A3A5C] bg-blue-50 text-[#1A3A5C]" : "border-gray-300 text-gray-600"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>

            <label className="block text-xs font-medium text-gray-500 mb-1">Number of posts (max 14)</label>
            <input
              type="number"
              min={1}
              max={14}
              value={postCount}
              onChange={(e) => setPostCount(Number(e.target.value))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-5"
            />

            <div className="flex gap-3">
              <button onClick={() => setModalOpen(false)} className="px-4 py-2 rounded-lg border border-gray-300 text-sm">
                Cancel
              </button>
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="flex-1 bg-[#1A3A5C] text-white text-sm font-medium py-2 rounded-lg disabled:opacity-60"
              >
                {generating ? "Generating…" : "Generate"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
