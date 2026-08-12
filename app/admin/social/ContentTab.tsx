"use client";

import { useMemo, useState } from "react";
import type { SocialBrand, SocialContent, SocialContentStatus, SocialPlatform, SocialVideoAsset } from "@/lib/database.types";

const STATUS_STYLE: Record<SocialContentStatus, string> = {
  draft: "bg-slate-100 text-slate-600",
  approved: "bg-sky-100 text-sky-700",
  scheduled: "bg-amber-100 text-amber-700",
  posted: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
};

const STATUS_DOT: Record<SocialContentStatus, string> = {
  draft: "bg-zinc-500",
  approved: "bg-sky-400",
  scheduled: "bg-amber-400",
  posted: "bg-green-400",
  failed: "bg-red-400",
};

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// new Date("YYYY-MM-DD") parses as UTC midnight, which can render as the
// previous day in timezones behind UTC — build the Date from local parts.
function parseDayKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

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
  const [view, setView] = useState<"list" | "calendar">("list");
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

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

  // ── Calendar derived state ──────────────────────────────────────
  const postsByDay = useMemo(() => {
    const map = new Map<string, SocialContent[]>();
    for (const c of content) {
      if (!c.scheduled_at) continue;
      const key = dayKey(new Date(c.scheduled_at));
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }
    return map;
  }, [content]);

  const unscheduled = useMemo(
    () => content.filter((c) => (c.status === "draft" || c.status === "approved") && !c.scheduled_at),
    [content]
  );

  const calendarCells = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    const startOffset = firstOfMonth.getDay(); // 0 = Sunday
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: (Date | null)[] = [];
    for (let i = 0; i < startOffset; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [calendarMonth]);

  const todayKey = dayKey(new Date());
  const selectedDayPosts = selectedDay ? (postsByDay.get(selectedDay) ?? []) : [];

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-[#1A3A5C]">Content Calendar</h2>
        <div className="flex items-center gap-3">
          <div className="flex bg-white border border-green-600 rounded-lg p-0.5">
            <button
              onClick={() => setView("list")}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                view === "list" ? "bg-[#1A3A5C] text-white" : "text-slate-500"
              }`}
            >
              List
            </button>
            <button
              onClick={() => setView("calendar")}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                view === "calendar" ? "bg-[#1A3A5C] text-white" : "text-slate-500"
              }`}
            >
              Calendar
            </button>
          </div>
          <button
            onClick={() => setModalOpen(true)}
            disabled={brands.length === 0}
            className="px-4 py-2 rounded-lg bg-[#1A3A5C] text-white text-sm font-medium hover:bg-[#15304a] transition-colors disabled:opacity-40"
          >
            Generate Content
          </button>
        </div>
      </div>

      {view === "list" ? (
        <>
          <div className="flex gap-2 mb-4">
            {(["all", "draft", "approved", "scheduled", "posted", "failed"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium capitalize transition-colors ${
                  statusFilter === s ? "bg-[#1A3A5C] text-white" : "bg-white border border-green-600 text-slate-600"
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <div className="bg-white border border-dashed border-slate-300 rounded-xl p-10 text-center text-slate-400 text-sm">
              No content{statusFilter !== "all" ? ` with status "${statusFilter}"` : ""} yet.
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((c) => (
                <ContentCard
                  key={c.id}
                  c={c}
                  brandName={brandName}
                  videoAssets={videoAssets}
                  scheduleDrafts={scheduleDrafts}
                  setScheduleDrafts={setScheduleDrafts}
                  updateStatus={updateStatus}
                  linkVideoAsset={linkVideoAsset}
                  deleteContent={deleteContent}
                />
              ))}
            </div>
          )}
        </>
      ) : (
        <div>
          {unscheduled.length > 0 && (
            <div className="mb-4 p-3 bg-white border border-dashed border-slate-300 rounded-xl">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                Unscheduled ({unscheduled.length})
              </p>
              <div className="flex flex-wrap gap-2">
                {unscheduled.map((c) => (
                  <span
                    key={c.id}
                    className="text-xs px-2 py-1 rounded-lg bg-slate-100 border border-slate-300 text-slate-600"
                    title={c.hook || c.caption}
                  >
                    {brandName(c.brand_id)} · {c.platform} · {(c.hook || c.caption).slice(0, 30)}
                    {(c.hook || c.caption).length > 30 ? "…" : ""}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between mb-3">
            <button
              onClick={() => setCalendarMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
              className="text-sm text-slate-500 hover:text-[#1A3A5C] px-2"
            >
              ← Prev
            </button>
            <p className="text-sm font-semibold text-[#1A3A5C]">
              {calendarMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
            </p>
            <button
              onClick={() => setCalendarMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
              className="text-sm text-slate-500 hover:text-[#1A3A5C] px-2"
            >
              Next →
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-4">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d} className="text-center text-[10px] font-semibold uppercase tracking-wide text-slate-400 py-1">
                {d}
              </div>
            ))}
            {calendarCells.map((date, i) => {
              if (!date) return <div key={i} className="min-h-[84px] rounded-lg" />;
              const key = dayKey(date);
              const posts = postsByDay.get(key) ?? [];
              const isToday = key === todayKey;
              const isSelected = key === selectedDay;
              return (
                <button
                  key={i}
                  onClick={() => setSelectedDay(key === selectedDay ? null : key)}
                  className={`min-h-[84px] rounded-lg border p-1.5 text-left align-top transition-colors ${
                    isSelected
                      ? "border-purple-500 bg-purple-50"
                      : isToday
                        ? "border-sky-500 bg-sky-50"
                        : "border-slate-200 bg-white hover:border-slate-400"
                  }`}
                >
                  <span className={`text-xs ${isToday ? "text-sky-600 font-semibold" : "text-slate-500"}`}>
                    {date.getDate()}
                  </span>
                  <div className="mt-1 space-y-0.5">
                    {posts.slice(0, 3).map((p) => (
                      <div key={p.id} className="flex items-center gap-1">
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS_DOT[p.status]}`} />
                        <span className="text-[10px] text-slate-500 truncate">{brandName(p.brand_id)}</span>
                      </div>
                    ))}
                    {posts.length > 3 && <p className="text-[10px] text-slate-400">+{posts.length - 3} more</p>}
                  </div>
                </button>
              );
            })}
          </div>

          {selectedDay && (
            <div>
              <p className="text-sm font-semibold text-[#1A3A5C] mb-3">
                {parseDayKey(selectedDay).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
                {selectedDayPosts.length === 0 && <span className="text-slate-400 font-normal"> — nothing scheduled</span>}
              </p>
              <div className="space-y-3">
                {selectedDayPosts.map((c) => (
                  <ContentCard
                    key={c.id}
                    c={c}
                    brandName={brandName}
                    videoAssets={videoAssets}
                    scheduleDrafts={scheduleDrafts}
                    setScheduleDrafts={setScheduleDrafts}
                    updateStatus={updateStatus}
                    linkVideoAsset={linkVideoAsset}
                    deleteContent={deleteContent}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-green-600 rounded-2xl p-6 w-full max-w-md">
            <h3 className="text-lg font-bold text-[#1A3A5C] mb-4">Generate content</h3>
            {error && <div className="mb-3 p-2 rounded-lg bg-red-100 border border-red-300 text-red-700 text-sm">{error}</div>}

            <label className="block text-xs font-medium text-slate-500 mb-1">Brand</label>
            <select value={brandId} onChange={(e) => setBrandId(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mb-4">
              {brands.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>

            <label className="block text-xs font-medium text-slate-500 mb-1">Platforms</label>
            <div className="flex gap-2 mb-4">
              {(["facebook", "instagram", "tiktok"] as SocialPlatform[]).map((p) => (
                <button
                  key={p}
                  onClick={() => togglePlatform(p)}
                  className={`px-3 py-1.5 rounded-lg text-sm capitalize border transition-colors ${
                    platforms.includes(p) ? "border-[#1A3A5C] bg-blue-100 text-[#1A3A5C]" : "border-slate-300 text-slate-600"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>

            <label className="block text-xs font-medium text-slate-500 mb-1">Number of posts (max 14)</label>
            <input
              type="number"
              min={1}
              max={14}
              value={postCount}
              onChange={(e) => setPostCount(Number(e.target.value))}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mb-5"
            />

            <div className="flex gap-3">
              <button onClick={() => setModalOpen(false)} className="px-4 py-2 rounded-lg border border-slate-300 text-slate-600 text-sm">
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

function ContentCard({
  c,
  brandName,
  videoAssets,
  scheduleDrafts,
  setScheduleDrafts,
  updateStatus,
  linkVideoAsset,
  deleteContent,
}: {
  c: SocialContent;
  brandName: (id: string) => string;
  videoAssets: SocialVideoAsset[];
  scheduleDrafts: Record<string, string>;
  setScheduleDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  updateStatus: (id: string, status: SocialContentStatus, scheduledAt?: string) => Promise<void>;
  linkVideoAsset: (id: string, videoAssetId: string) => Promise<void>;
  deleteContent: (id: string) => Promise<void>;
}) {
  const [generatingImage, setGeneratingImage] = useState(false);
  const [imageError, setImageError] = useState("");
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [hasImage, setHasImage] = useState(!!c.image_path);

  async function generateImage() {
    setGeneratingImage(true);
    setImageError("");
    try {
      const res = await fetch(`/api/social/content/${c.id}/generate-image`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setPreviewDataUrl(body.dataUrl);
      setHasImage(true);
    } catch (err) {
      setImageError((err as Error).message);
    } finally {
      setGeneratingImage(false);
    }
  }

  async function loadExistingImage() {
    if (previewDataUrl) {
      setPreviewDataUrl(null);
      return;
    }
    try {
      const res = await fetch(`/api/social/content/${c.id}/image-url`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setPreviewDataUrl(body.url);
    } catch (err) {
      setImageError((err as Error).message);
    }
  }

  return (
    <div className="bg-white border border-green-600 rounded-xl p-4">
      <div className="flex justify-between items-start mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-500">{brandName(c.brand_id)}</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 capitalize">{c.platform}</span>
          <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${STATUS_STYLE[c.status]}`}>
            {c.status}
          </span>
        </div>
        <button onClick={() => deleteContent(c.id)} className="text-xs text-red-600 hover:underline">
          Delete
        </button>
      </div>
      {c.hook && <p className="font-medium text-sm text-[#1A3A5C] mb-1">{c.hook}</p>}
      <p className="text-sm text-slate-700 whitespace-pre-wrap mb-2">{c.caption}</p>
      {c.hashtags.length > 0 && (
        <p className="text-xs text-slate-400 mb-3">{c.hashtags.map((h) => `#${h}`).join(" ")}</p>
      )}
      {c.status === "failed" && c.failure_reason && (
        <p className="text-xs text-red-600 mb-2">Failed: {c.failure_reason}</p>
      )}

      {c.platform !== "tiktok" && (c.status === "draft" || c.status === "approved" || c.status === "scheduled") && (
        <div className="mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={generateImage}
              disabled={generatingImage}
              className="text-xs font-medium text-purple-600 hover:underline disabled:opacity-50"
            >
              {generatingImage ? "Generating…" : hasImage ? "Regenerate image" : "Generate image"}
            </button>
            {hasImage && (
              <button onClick={loadExistingImage} className="text-xs font-medium text-sky-600 hover:underline">
                {previewDataUrl ? "Hide preview" : "Show image"}
              </button>
            )}
          </div>
          {imageError && <p className="text-xs text-red-600 mt-1">{imageError}</p>}
          {previewDataUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewDataUrl} alt="Generated post image" className="mt-2 w-40 rounded-lg border border-slate-300" />
          )}
        </div>
      )}

      {(c.platform === "instagram" || c.platform === "tiktok") && (c.status === "draft" || c.status === "approved") && (
        <div className="mb-2">
          <label className="text-xs text-slate-500 mr-2">
            Video asset{" "}
            {c.platform === "tiktok"
              ? "(required for TikTok)"
              : hasImage
                ? "(optional — a generated image is already linked)"
                : "(or generate an image above)"}
            :
          </label>
          <select
            value={c.video_asset_id ?? ""}
            onChange={(e) => linkVideoAsset(c.id, e.target.value)}
            className="text-xs border border-slate-300 rounded-lg px-2 py-1"
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
              className="text-xs border border-slate-300 rounded-lg px-2 py-1"
            />
            <button
              onClick={() => scheduleDrafts[c.id] && updateStatus(c.id, "scheduled", new Date(scheduleDrafts[c.id]).toISOString())}
              disabled={!scheduleDrafts[c.id]}
              className="text-xs font-medium text-amber-600 hover:underline disabled:opacity-40"
            >
              Schedule
            </button>
          </>
        )}
        {c.status === "scheduled" && c.scheduled_at && (
          <span className="text-xs text-slate-500">Scheduled for {new Date(c.scheduled_at).toLocaleString()}</span>
        )}
      </div>
    </div>
  );
}
