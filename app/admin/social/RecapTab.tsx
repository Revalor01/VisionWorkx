"use client";

import { useEffect, useState } from "react";
import type { WeeklyRecap } from "@/lib/database.types";
import MediaSpendCard from "./MediaSpendCard";

export default function RecapTab() {
  const [recaps, setRecaps] = useState<WeeklyRecap[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingScript, setGeneratingScript] = useState(false);
  const [generatingVideoId, setGeneratingVideoId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [errorSource, setErrorSource] = useState<"script" | "video" | null>(null);
  const [editing, setEditing] = useState<Record<string, { script: string; videoPrompt: string }>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    loadRecaps();
  }, []);

  async function loadRecaps() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/recap");
      const body = await res.json();
      if (res.ok) setRecaps(body.recaps);
    } finally {
      setLoading(false);
    }
  }

  async function generateScript() {
    setGeneratingScript(true);
    setError("");
    setErrorSource(null);
    try {
      const res = await fetch("/api/admin/recap/generate-script", { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setRecaps((prev) => {
        const withoutThisWeek = prev.filter((r) => r.week_start !== body.recap.week_start);
        return [body.recap, ...withoutThisWeek];
      });
    } catch (err) {
      setError((err as Error).message);
      setErrorSource("script");
    } finally {
      setGeneratingScript(false);
    }
  }

  function fieldsFor(recap: WeeklyRecap) {
    return editing[recap.id] ?? { script: recap.script ?? "", videoPrompt: recap.video_prompt ?? "" };
  }

  function updateField(recapId: string, field: "script" | "videoPrompt", value: string) {
    const recap = recaps.find((r) => r.id === recapId)!;
    setEditing((prev) => ({
      ...prev,
      [recapId]: { ...(prev[recapId] ?? { script: recap.script ?? "", videoPrompt: recap.video_prompt ?? "" }), [field]: value },
    }));
  }

  async function saveEdits(recap: WeeklyRecap) {
    const fields = fieldsFor(recap);
    setSaving(recap.id);
    try {
      await fetch(`/api/admin/recap/${recap.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script: fields.script, videoPrompt: fields.videoPrompt }),
      });
      setRecaps((prev) => prev.map((r) => (r.id === recap.id ? { ...r, script: fields.script, video_prompt: fields.videoPrompt } : r)));
    } finally {
      setSaving(null);
    }
  }

  async function generateVideo(recap: WeeklyRecap) {
    await saveEdits(recap);
    setGeneratingVideoId(recap.id);
    setError("");
    setErrorSource(null);
    try {
      const res = await fetch(`/api/admin/recap/${recap.id}/generate-video`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setRecaps((prev) => prev.map((r) => (r.id === recap.id ? { ...r, status: "video_ready", video_path: body.videoPath } : r)));
      loadPreview(recap.id);
    } catch (err) {
      setError((err as Error).message);
      setErrorSource("video");
    } finally {
      setGeneratingVideoId(null);
    }
  }

  async function downloadVideo(recapId: string) {
    const res = await fetch(`/api/admin/recap/${recapId}/video-url?download=1`);
    const body = await res.json();
    if (!res.ok) {
      setError(body.error ?? `HTTP ${res.status}`);
      return;
    }
    window.location.href = body.url;
  }

  async function loadPreview(recapId: string) {
    if (previewUrls[recapId]) {
      setPreviewUrls((prev) => {
        const next = { ...prev };
        delete next[recapId];
        return next;
      });
      return;
    }
    const res = await fetch(`/api/admin/recap/${recapId}/video-url`);
    const body = await res.json();
    if (res.ok) setPreviewUrls((prev) => ({ ...prev, [recapId]: body.url }));
  }

  const thisWeekExists = recaps.some((r) => {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    return new Date(r.week_start) >= new Date(weekAgo.toISOString().slice(0, 10));
  });

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-lg font-semibold text-[#1A3A5C]">Weekly Recap</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Real stats pulled from all four products, turned into a short personal recap video to share yourself.
          </p>
        </div>
        <button
          onClick={generateScript}
          disabled={generatingScript}
          className="px-4 py-2 rounded-lg bg-[#1A3A5C] text-white text-sm font-medium hover:bg-[#15304a] transition-colors disabled:opacity-50"
        >
          {generatingScript ? "Pulling stats…" : thisWeekExists ? "Regenerate this week's script" : "Generate this week's script"}
        </button>
      </div>

      <MediaSpendCard focus="video" />

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-100 border border-red-300 text-red-700 text-sm">
          {error}
          {errorSource === "video" && (
            <p className="mt-2 text-xs text-red-600">
              Automated video generation failed. Check the{" "}
              <a
                href="https://vercel.com/dashboard/ai-gateway"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-red-800"
              >
                Vercel AI Gateway dashboard
              </a>{" "}
              for the underlying error (rate limit, outage, billing), or generate the clip manually at{" "}
              <a href="https://klingai.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-red-800">
                klingai.com
              </a>{" "}
              and upload it in the Video tab.
            </p>
          )}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : recaps.length === 0 ? (
        <div className="bg-white border border-dashed border-slate-300 rounded-xl p-10 text-center text-slate-400 text-sm">
          No recaps yet — click &ldquo;Generate this week&apos;s script&rdquo; to pull real stats and draft one.
        </div>
      ) : (
        <div className="space-y-4">
          {recaps.map((recap) => {
            const fields = fieldsFor(recap);
            const stats = recap.stats as Record<string, Record<string, number>>;
            return (
              <div key={recap.id} className="bg-white border border-green-600 rounded-xl p-4">
                <div className="flex justify-between items-start mb-3">
                  <span className="text-sm font-semibold text-[#1A3A5C]">Week of {recap.week_start}</span>
                  <span
                    className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${
                      recap.status === "video_ready" ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {recap.status === "video_ready" ? "Video ready" : "Draft"}
                  </span>
                </div>

                <div className="grid sm:grid-cols-4 gap-2 mb-3 text-xs text-slate-500">
                  {Object.entries(stats ?? {}).map(([product, values]) => (
                    <div key={product} className="bg-slate-50 border border-slate-200 rounded-lg p-2">
                      <p className="font-semibold text-slate-600 capitalize mb-1">{product}</p>
                      {Object.entries(values).map(([k, v]) => (
                        <p key={k}>
                          {k}: <span className="text-[#1A3A5C]">{v}</span>
                        </p>
                      ))}
                    </div>
                  ))}
                </div>

                <label className="block text-xs font-medium text-slate-500 mb-1">Script / caption</label>
                <textarea
                  value={fields.script}
                  onChange={(e) => updateField(recap.id, "script", e.target.value)}
                  rows={3}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mb-3 resize-none bg-white text-slate-800"
                />

                <label className="block text-xs font-medium text-slate-500 mb-1">Video visual prompt</label>
                <textarea
                  value={fields.videoPrompt}
                  onChange={(e) => updateField(recap.id, "videoPrompt", e.target.value)}
                  rows={2}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mb-3 resize-none bg-white text-slate-800"
                />

                <div className="flex items-center gap-3 flex-wrap">
                  <button
                    onClick={() => saveEdits(recap)}
                    disabled={saving === recap.id}
                    className="text-xs font-medium text-sky-600 hover:underline disabled:opacity-50"
                  >
                    {saving === recap.id ? "Saving…" : "Save edits"}
                  </button>
                  <button
                    onClick={() => generateVideo(recap)}
                    disabled={generatingVideoId === recap.id || !fields.videoPrompt}
                    className="text-xs font-medium text-purple-600 hover:underline disabled:opacity-50"
                  >
                    {generatingVideoId === recap.id
                      ? "Generating video… this can take a minute or two"
                      : recap.status === "video_ready"
                        ? "Regenerate video"
                        : "Generate video"}
                  </button>
                  {recap.status === "video_ready" && (
                    <>
                      <button onClick={() => loadPreview(recap.id)} className="text-xs font-medium text-amber-600 hover:underline">
                        {previewUrls[recap.id] ? "Hide preview" : "Show video"}
                      </button>
                      <button onClick={() => downloadVideo(recap.id)} className="text-xs font-medium text-emerald-600 hover:underline">
                        Download
                      </button>
                    </>
                  )}
                </div>

                {previewUrls[recap.id] && (
                  <video controls src={previewUrls[recap.id]} className="w-full max-w-xs mt-3 rounded-lg bg-black" />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
