"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { BlogPost, BlogKeyword, BlogRunLogEntry } from "@/lib/database.types";
import { PRODUCTS } from "@/lib/blog/products";

type Tab = "drafts" | "published" | "keywords" | "log";

export default function SeoDashboard({
  initialPosts,
  initialKeywords,
  runLog,
}: {
  initialPosts: BlogPost[];
  initialKeywords: BlogKeyword[];
  runLog: BlogRunLogEntry[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("drafts");
  const [posts, setPosts] = useState(initialPosts);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const drafts = posts.filter((p) => p.status === "draft");
  const published = posts.filter((p) => p.status === "published");

  async function handleGenerate() {
    setGenerating(true);
    setGenError("");
    try {
      const res = await fetch("/api/admin/seo/generate", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setGenError(data.error ?? "Generation failed");
      } else {
        router.refresh();
      }
    } catch {
      setGenError("Network error");
    } finally {
      setGenerating(false);
    }
  }

  async function updatePost(id: string, update: Record<string, unknown>) {
    const res = await fetch(`/api/admin/seo/posts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(update),
    });
    if (res.ok) {
      setPosts((prev) => prev.map((p) => (p.id === id ? { ...p, ...update } : p)));
    }
    return res.ok;
  }

  async function deletePost(id: string) {
    const res = await fetch(`/api/admin/seo/posts/${id}`, { method: "DELETE" });
    if (res.ok) {
      setPosts((prev) => prev.filter((p) => p.id !== id));
      setExpandedId(null);
    }
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <header className="bg-[#1A3A5C] text-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold tracking-tight">Vision Workx</span>
          <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full font-medium">SEO</span>
        </div>
        <Link href="/admin" className="text-xs text-white/70 hover:text-white transition-colors">
          ← Back to Admin
        </Link>
      </header>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-[#1A3A5C]">SEO Content</h1>
            <p className="text-gray-500 text-sm mt-1">
              Weekly keyword research + AI blog posts marketing the Revalor product lineup — internal use only.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {genError && <span className="text-xs text-red-600">{genError}</span>}
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="rounded-lg bg-[#1A3A5C] px-4 py-2 text-sm font-semibold text-white hover:bg-[#122842] disabled:opacity-50"
            >
              {generating ? "Generating…" : "Generate Now"}
            </button>
          </div>
        </div>

        <div className="flex gap-1 mb-6 bg-white border border-gray-200 rounded-xl p-1 w-full sm:w-fit overflow-x-auto">
          {([
            ["drafts", `Drafts (${drafts.length})`],
            ["published", `Published (${published.length})`],
            ["keywords", `Keywords (${initialKeywords.length})`],
            ["log", "Run Log"],
          ] as [Tab, string][]).map(([t, label]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 sm:px-5 py-2 rounded-lg text-sm font-medium transition-colors shrink-0 ${
                tab === t ? "bg-[#1A3A5C] text-white" : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "drafts" && (
          <div className="space-y-3">
            {drafts.length === 0 && (
              <p className="text-sm text-gray-400 py-8 text-center">
                No drafts yet — hit &quot;Generate Now&quot; or wait for Monday&apos;s cron.
              </p>
            )}
            {drafts.map((post) => (
              <DraftCard
                key={post.id}
                post={post}
                expanded={expandedId === post.id}
                onToggle={() => setExpandedId(expandedId === post.id ? null : post.id)}
                onSave={(update) => updatePost(post.id, update)}
                onPublish={() => updatePost(post.id, { status: "published" })}
                onReject={() => deletePost(post.id)}
              />
            ))}
          </div>
        )}

        {tab === "published" && (
          <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
                  <th className="px-4 py-2.5 font-semibold">Title</th>
                  <th className="px-4 py-2.5 font-semibold">Product</th>
                  <th className="px-4 py-2.5 font-semibold">Score</th>
                  <th className="px-4 py-2.5 font-semibold">Published</th>
                  <th className="px-4 py-2.5 font-semibold"></th>
                </tr>
              </thead>
              <tbody>
                {published.map((post) => (
                  <tr key={post.id} className="border-b border-gray-50 last:border-0">
                    <td className="px-4 py-2.5 font-medium text-gray-800">{post.title}</td>
                    <td className="px-4 py-2.5 text-gray-500">{PRODUCTS[post.product].name}</td>
                    <td className="px-4 py-2.5 text-gray-700">{post.seo_score ?? "—"}/100</td>
                    <td className="px-4 py-2.5 text-gray-400">
                      {post.published_at ? new Date(post.published_at).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      <a
                        href={`/blog/${post.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        View →
                      </a>
                    </td>
                  </tr>
                ))}
                {published.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-gray-400">
                      Nothing published yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {tab === "keywords" && (
          <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
                  <th className="px-4 py-2.5 font-semibold">Keyword</th>
                  <th className="px-4 py-2.5 font-semibold">Product</th>
                  <th className="px-4 py-2.5 font-semibold">Source</th>
                  <th className="px-4 py-2.5 font-semibold">Discovered</th>
                </tr>
              </thead>
              <tbody>
                {initialKeywords.map((kw) => (
                  <tr key={kw.id} className="border-b border-gray-50 last:border-0">
                    <td className="px-4 py-2.5 font-medium text-gray-800">{kw.keyword}</td>
                    <td className="px-4 py-2.5 text-gray-500">{PRODUCTS[kw.product].name}</td>
                    <td className="px-4 py-2.5 text-gray-400">{kw.source}</td>
                    <td className="px-4 py-2.5 text-gray-400">
                      {new Date(kw.discovered_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
                {initialKeywords.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-gray-400">
                      No unused keywords queued.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {tab === "log" && (
          <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
                  <th className="px-4 py-2.5 font-semibold">Run</th>
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                  <th className="px-4 py-2.5 font-semibold">Summary</th>
                </tr>
              </thead>
              <tbody>
                {runLog.map((entry) => (
                  <tr key={entry.id} className="border-b border-gray-50 last:border-0">
                    <td className="px-4 py-2.5 text-gray-400">{new Date(entry.run_at).toLocaleString()}</td>
                    <td
                      className={`px-4 py-2.5 font-medium ${
                        entry.status === "success" ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {entry.status}
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">{entry.summary}</td>
                  </tr>
                ))}
                {runLog.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-6 text-center text-gray-400">
                      No runs yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function DraftCard({
  post,
  expanded,
  onToggle,
  onSave,
  onPublish,
  onReject,
}: {
  post: BlogPost;
  expanded: boolean;
  onToggle: () => void;
  onSave: (update: Record<string, unknown>) => Promise<boolean>;
  onPublish: () => void;
  onReject: () => void;
}) {
  const [title, setTitle] = useState(post.title);
  const [metaDescription, setMetaDescription] = useState(post.meta_description ?? "");
  const [body, setBody] = useState(post.body);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    const ok = await onSave({ title, meta_description: metaDescription, body });
    setSaving(false);
    if (ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center justify-between px-5 py-4 text-left">
        <div>
          <p className="font-semibold text-gray-800">{post.title}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {PRODUCTS[post.product].name} · &quot;{post.keyword}&quot; · score {post.seo_score ?? "—"}/100
          </p>
        </div>
        <span className="text-gray-400 text-sm">{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && (
        <div className="border-t border-gray-100 px-5 py-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-500">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500">Meta description</label>
            <input
              value={metaDescription}
              onChange={(e) => setMetaDescription(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500">Body (markdown)</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={14}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono"
            />
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {saving ? "Saving…" : saved ? "Saved ✓" : "Save"}
            </button>
            <button
              onClick={onPublish}
              className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700"
            >
              Publish
            </button>
            <button onClick={onReject} className="ml-auto text-sm text-red-600 hover:underline">
              Reject &amp; delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
