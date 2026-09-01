"use client";

import { useState } from "react";
import type { LinkedInPost, LinkedInPostStatus, SocialBrand, SocialVideoAsset } from "@/lib/database.types";

const STATUS_STYLE: Record<LinkedInPostStatus, string> = {
  draft: "bg-slate-100 text-slate-600",
  approved: "bg-sky-100 text-sky-700",
  posted: "bg-green-100 text-green-700",
};

export default function LinkedInTab({
  brands,
  posts,
  setPosts,
  videoAssets,
  setVideoAssets,
}: {
  brands: SocialBrand[];
  posts: LinkedInPost[];
  setPosts: React.Dispatch<React.SetStateAction<LinkedInPost[]>>;
  videoAssets: SocialVideoAsset[];
  setVideoAssets: React.Dispatch<React.SetStateAction<SocialVideoAsset[]>>;
}) {
  const [topic, setTopic] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  const revalorLlcId = brands.find((b) => b.name === "Revalor LLC")?.id;
  const readyVideos = videoAssets.filter((v) => v.brand_id === revalorLlcId && v.status === "ready");

  async function generatePost() {
    setGenerating(true);
    setError("");
    try {
      const res = await fetch("/api/social/linkedin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: topic.trim() || undefined }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setPosts((prev) => [body.post, ...prev]);
      setTopic("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div>
      <div className="bg-white border border-green-600 rounded-xl p-5 mb-6">
        <h2 className="text-lg font-semibold text-[#1A3A5C] mb-1">LinkedIn — Revalor LLC</h2>
        <p className="text-sm text-slate-500 mb-4">
          Manual-only. No LinkedIn API connection exists, so nothing here auto-publishes: generate a draft, review and
          edit it, generate a video if you want one, then log into LinkedIn yourself and ask Claude to post the
          approved draft.
        </p>
        {error && <div className="mb-3 p-2 rounded-lg bg-red-100 border border-red-300 text-red-700 text-sm">{error}</div>}
        <div className="flex gap-3 items-center">
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Optional topic (leave blank to let Claude pick an angle)"
            className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
          <button
            onClick={generatePost}
            disabled={generating}
            className="px-4 py-2 rounded-lg bg-[#1A3A5C] text-white text-sm font-medium hover:bg-[#15304a] transition-colors disabled:opacity-50"
          >
            {generating ? "Generating…" : "Generate Post"}
          </button>
        </div>
      </div>

      {posts.length === 0 ? (
        <div className="bg-white border border-dashed border-slate-300 rounded-xl p-10 text-center text-slate-400 text-sm">
          No LinkedIn posts yet.
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map((p) => (
            <PostCard
              key={p.id}
              post={p}
              setPosts={setPosts}
              readyVideos={readyVideos}
              setVideoAssets={setVideoAssets}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PostCard({
  post,
  setPosts,
  readyVideos,
  setVideoAssets,
}: {
  post: LinkedInPost;
  setPosts: React.Dispatch<React.SetStateAction<LinkedInPost[]>>;
  readyVideos: SocialVideoAsset[];
  setVideoAssets: React.Dispatch<React.SetStateAction<SocialVideoAsset[]>>;
}) {
  const [hook, setHook] = useState(post.hook ?? "");
  const [caption, setCaption] = useState(post.caption);
  const [hashtags, setHashtags] = useState(post.hashtags.join(", "));
  const [saving, setSaving] = useState(false);
  const [generatingVideo, setGeneratingVideo] = useState(false);
  const [videoError, setVideoError] = useState("");
  const [copied, setCopied] = useState(false);

  const dirty = hook !== (post.hook ?? "") || caption !== post.caption || hashtags !== post.hashtags.join(", ");

  async function save(patch: Partial<{ hook: string; caption: string; hashtags: string[]; status: LinkedInPostStatus; videoAssetId: string | null }>) {
    setSaving(true);
    try {
      const res = await fetch(`/api/social/linkedin/${post.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setPosts((prev) => prev.map((p) => (p.id === post.id ? body.post : p)));
    } finally {
      setSaving(false);
    }
  }

  async function generateVideo() {
    setGeneratingVideo(true);
    setVideoError("");
    try {
      const res = await fetch(`/api/social/linkedin/${post.id}/generate-video`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setVideoAssets((prev) => [body.asset, ...prev]);
      setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, video_asset_id: body.asset.id } : p)));

      for (let attempt = 0; attempt < 90; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 4000));
        const pollRes = await fetch(`/api/social/video-assets/${body.asset.id}`);
        const pollBody = await pollRes.json();
        if (!pollRes.ok) throw new Error(pollBody.error ?? `HTTP ${pollRes.status}`);
        setVideoAssets((prev) => prev.map((v) => (v.id === pollBody.asset.id ? pollBody.asset : v)));
        if (pollBody.asset.status === "ready") return;
        if (pollBody.asset.status === "failed") throw new Error(pollBody.asset.notes || "Video generation failed");
      }
      throw new Error("Still generating after several minutes — check the Video tab shortly");
    } catch (err) {
      setVideoError((err as Error).message);
    } finally {
      setGeneratingVideo(false);
    }
  }

  async function copyCaption() {
    const full = hashtags.trim() ? `${caption}\n\n${hashtags.split(",").map((h) => `#${h.trim()}`).join(" ")}` : caption;
    await navigator.clipboard.writeText(full);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="bg-white border border-green-600 rounded-xl p-4">
      <div className="flex justify-between items-start mb-2">
        <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${STATUS_STYLE[post.status]}`}>
          {post.status}
        </span>
        <button
          onClick={() => fetch(`/api/social/linkedin/${post.id}`, { method: "DELETE" }).then(() => setPosts((prev) => prev.filter((p) => p.id !== post.id)))}
          className="text-xs text-red-600 hover:underline"
        >
          Delete
        </button>
      </div>

      <label className="block text-xs font-medium text-slate-500 mb-1">Hook (first line, shown before "see more")</label>
      <input
        value={hook}
        onChange={(e) => setHook(e.target.value)}
        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mb-3 font-medium"
      />

      <label className="block text-xs font-medium text-slate-500 mb-1">Caption</label>
      <textarea
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        rows={8}
        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mb-3 whitespace-pre-wrap"
      />

      <label className="block text-xs font-medium text-slate-500 mb-1">Hashtags (comma-separated)</label>
      <input
        value={hashtags}
        onChange={(e) => setHashtags(e.target.value)}
        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mb-3"
      />

      {dirty && (
        <button
          onClick={() => save({ hook, caption, hashtags: hashtags.split(",").map((h) => h.trim()).filter(Boolean) })}
          disabled={saving}
          className="text-xs font-medium text-sky-700 hover:underline mb-3 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save edits"}
        </button>
      )}

      <div className="mb-3">
        <label className="text-xs text-slate-500 mr-2">Video (optional):</label>
        <select
          value={post.video_asset_id ?? ""}
          onChange={(e) => save({ videoAssetId: e.target.value || null })}
          className="text-xs border border-slate-300 rounded-lg px-2 py-1"
        >
          <option value="">— none —</option>
          {readyVideos.map((v) => (
            <option key={v.id} value={v.id}>{v.id.slice(0, 8)} (ready)</option>
          ))}
        </select>
        <button
          onClick={generateVideo}
          disabled={generatingVideo}
          className="ml-2 text-xs font-medium text-purple-600 hover:underline disabled:opacity-50"
        >
          {generatingVideo ? "Generating… (usually 2-4 min)" : "Generate video"}
        </button>
        {videoError && <p className="text-xs text-red-600 mt-1">{videoError}</p>}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        {post.status === "draft" && (
          <button onClick={() => save({ status: "approved" })} className="text-xs font-medium text-sky-700 hover:underline">
            Approve
          </button>
        )}
        <button onClick={copyCaption} className="text-xs font-medium text-purple-600 hover:underline">
          {copied ? "Copied!" : "Copy caption + hashtags"}
        </button>
        {post.status === "approved" && (
          <button onClick={() => save({ status: "posted" })} className="text-xs font-medium text-green-700 hover:underline">
            Mark as posted
          </button>
        )}
      </div>
    </div>
  );
}
