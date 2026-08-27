"use client";

import { useEffect, useState } from "react";
import type {
  ContentDerivative,
  ContentDerivativeChannel,
  ContentItem,
  ContentSourceType,
  ContentTopic,
  ContentTopicCadence,
  MarketingAutonomy,
  MarketingProduct,
} from "@/lib/database.types";
import { MARKETING_PRODUCTS } from "@/lib/marketing/products";

const PRODUCTS: { value: MarketingProduct; label: string }[] = MARKETING_PRODUCTS.map((p) => ({ value: p.slug, label: p.name }));
const WEEKDAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const CHANNELS: { value: ContentDerivativeChannel; label: string }[] = [
  { value: "blog", label: "Blog" },
  { value: "social", label: "Social" },
  { value: "email", label: "Email" },
  { value: "push", label: "Push" },
  { value: "sms", label: "SMS" },
];

function productLabel(p: MarketingProduct): string {
  return PRODUCTS.find((x) => x.value === p)?.label ?? p;
}

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-slate-700 text-slate-200",
  generated: "bg-slate-700 text-slate-200",
  pending_review: "bg-amber-900/60 text-amber-300",
  approved: "bg-sky-900/60 text-sky-300",
  published: "bg-green-900/60 text-green-300",
  failed: "bg-red-900/60 text-red-300",
  draft: "bg-slate-700 text-slate-200",
  ready: "bg-sky-900/60 text-sky-300",
  archived: "bg-slate-800 text-slate-500",
};

interface SocialBrandOption {
  id: string;
  name: string;
  slug: string;
}

export default function ContentDashboard({
  initialItems,
  initialTopics,
  socialBrands,
}: {
  initialItems: ContentItem[];
  initialTopics: ContentTopic[];
  socialBrands: SocialBrandOption[];
}) {
  const [items, setItems] = useState(initialItems);
  const [topics, setTopics] = useState(initialTopics);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  // Create source item
  const [itemProduct, setItemProduct] = useState<MarketingProduct>("visionworkx");
  const [itemSourceType, setItemSourceType] = useState<ContentSourceType>("update");
  const [itemTitle, setItemTitle] = useState("");
  const [itemBody, setItemBody] = useState("");
  const [creatingItem, setCreatingItem] = useState(false);

  // Calendar / topics
  const [topicProduct, setTopicProduct] = useState<MarketingProduct>("visionworkx");
  const [topicText, setTopicText] = useState("");
  const [topicKeywords, setTopicKeywords] = useState("");
  const [topicCadence, setTopicCadence] = useState<ContentTopicCadence>("on_demand");
  const [topicDayOfWeek, setTopicDayOfWeek] = useState(1);
  const [topicDayOfMonth, setTopicDayOfMonth] = useState(1);
  const [topicHourUtc, setTopicHourUtc] = useState(13);
  const [topicSocialBrandId, setTopicSocialBrandId] = useState("");
  const [creatingTopic, setCreatingTopic] = useState(false);
  const [busyTopicIds, setBusyTopicIds] = useState<Set<string>>(new Set());

  // Selected item + its derivatives
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [derivatives, setDerivatives] = useState<ContentDerivative[]>([]);
  const [loadingDerivatives, setLoadingDerivatives] = useState(false);
  const [genChannels, setGenChannels] = useState<Set<ContentDerivativeChannel>>(new Set(["email"]));
  const [genAutonomy, setGenAutonomy] = useState<MarketingAutonomy>("manual");
  const [genSocialBrandId, setGenSocialBrandId] = useState("");
  const [generating, setGenerating] = useState(false);
  const [busyDerivativeIds, setBusyDerivativeIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!selectedItemId) return;
    loadDerivatives(selectedItemId);
  }, [selectedItemId]);

  async function loadDerivatives(itemId: string) {
    setLoadingDerivatives(true);
    try {
      const res = await fetch(`/api/admin/content/items/${itemId}/derivatives`);
      const body = await res.json();
      if (res.ok) setDerivatives(body.derivatives);
    } finally {
      setLoadingDerivatives(false);
    }
  }

  async function createItem() {
    setCreatingItem(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/admin/content/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product: itemProduct, sourceType: itemSourceType, title: itemTitle, body: itemBody }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setItems((prev) => [body.item, ...prev]);
      setSelectedItemId(body.item.id);
      setItemTitle("");
      setItemBody("");
      setMessage("Source item created — pick channels below to generate derivatives.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCreatingItem(false);
    }
  }

  async function createTopic() {
    setCreatingTopic(true);
    setError("");
    try {
      const res = await fetch("/api/admin/content/topics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product: topicProduct,
          topic: topicText,
          keywordCluster: topicKeywords.split(",").map((k) => k.trim()).filter(Boolean),
          cadence: topicCadence,
          dayOfWeek: topicDayOfWeek,
          dayOfMonth: topicDayOfMonth,
          hourUtc: topicHourUtc,
          socialBrandId: topicSocialBrandId || undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setTopics((prev) => [body.topic, ...prev]);
      setTopicText("");
      setTopicKeywords("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCreatingTopic(false);
    }
  }

  async function cancelTopic(id: string) {
    setBusyTopicIds((prev) => new Set(prev).add(id));
    try {
      const res = await fetch(`/api/admin/content/topics/${id}/cancel`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setTopics((prev) => prev.map((t) => (t.id === id ? { ...t, active: false } : t)));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyTopicIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  function toggleChannel(c: ContentDerivativeChannel) {
    setGenChannels((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  }

  async function generateDerivatives() {
    if (!selectedItemId || genChannels.size === 0) return;
    setGenerating(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch(`/api/admin/content/items/${selectedItemId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channels: Array.from(genChannels).map((channel) => ({ channel, autonomy: genAutonomy })),
          socialBrandId: genSocialBrandId || undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setMessage("Derivatives generated — see below.");
      await loadDerivatives(selectedItemId);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  async function approveDerivative(id: string) {
    setBusyDerivativeIds((prev) => new Set(prev).add(id));
    setError("");
    try {
      const res = await fetch(`/api/admin/content/derivatives/${id}/approve`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      if (selectedItemId) await loadDerivatives(selectedItemId);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyDerivativeIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  const activeTopics = topics.filter((t) => t.active);

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="bg-[#1A3A5C] text-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold tracking-tight">Revalor</span>
          <span className="text-xs bg-black/20 px-2 py-0.5 rounded-full font-medium">Content Engine</span>
        </div>
        <a href="/admin/marketing" className="text-xs text-white/70 hover:text-white transition-colors">
          ← Email Marketing
        </a>
      </header>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <h1 className="text-2xl font-bold text-white mb-1">Content Engine</h1>
        <p className="text-slate-400 text-sm mb-8">
          One source item auto-drafts a blog post, social captions, an email, and a push/SMS one-liner — each with its own
          review state.
        </p>

        {error && <div className="mb-4 p-2 rounded-lg bg-red-900/40 border border-red-700 text-red-300 text-sm">{error}</div>}
        {message && <div className="mb-4 p-2 rounded-lg bg-green-900/40 border border-green-700 text-green-300 text-sm">{message}</div>}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <section className="bg-[#0d0d0d] rounded-2xl border border-green-600 p-6">
            <h2 className="font-semibold text-white mb-3">New source item</h2>
            <label className="block text-xs font-medium text-slate-400 mb-1">Product</label>
            <select
              value={itemProduct}
              onChange={(e) => setItemProduct(e.target.value as MarketingProduct)}
              className="w-full bg-black border border-slate-700 rounded-lg px-3 py-2 text-sm mb-2"
            >
              {PRODUCTS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
            <label className="block text-xs font-medium text-slate-400 mb-1">Source type</label>
            <select
              value={itemSourceType}
              onChange={(e) => setItemSourceType(e.target.value as ContentSourceType)}
              className="w-full bg-black border border-slate-700 rounded-lg px-3 py-2 text-sm mb-2"
            >
              <option value="blog">Blog</option>
              <option value="announcement">Announcement</option>
              <option value="update">Update</option>
            </select>
            <label className="block text-xs font-medium text-slate-400 mb-1">Title</label>
            <input
              value={itemTitle}
              onChange={(e) => setItemTitle(e.target.value)}
              className="w-full bg-black border border-slate-700 rounded-lg px-3 py-2 text-sm mb-2"
            />
            <label className="block text-xs font-medium text-slate-400 mb-1">Body</label>
            <textarea
              value={itemBody}
              onChange={(e) => setItemBody(e.target.value)}
              rows={5}
              placeholder="The real substance — what shipped, what changed, why it matters. Every derivative is repurposed from this."
              className="w-full bg-black border border-slate-700 rounded-lg px-3 py-2 text-sm mb-3"
            />
            <button
              onClick={createItem}
              disabled={creatingItem || !itemTitle.trim() || !itemBody.trim()}
              className="px-4 py-2 rounded-lg bg-[#1A3A5C] text-white text-sm font-medium hover:bg-[#15304a] transition-colors disabled:opacity-50"
            >
              {creatingItem ? "Creating…" : "Create source item"}
            </button>
          </section>

          <section className="bg-[#0d0d0d] rounded-2xl border border-sky-700 p-6">
            <h2 className="font-semibold text-white mb-1">Content calendar</h2>
            <p className="text-xs text-slate-500 mb-3">Recurring topics auto-create a source item on schedule — derivatives still need a review click below.</p>
            <label className="block text-xs font-medium text-slate-400 mb-1">Product</label>
            <select
              value={topicProduct}
              onChange={(e) => setTopicProduct(e.target.value as MarketingProduct)}
              className="w-full bg-black border border-slate-700 rounded-lg px-3 py-2 text-sm mb-2"
            >
              {PRODUCTS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
            <label className="block text-xs font-medium text-slate-400 mb-1">Topic</label>
            <input
              value={topicText}
              onChange={(e) => setTopicText(e.target.value)}
              placeholder="e.g. monthly product digest"
              className="w-full bg-black border border-slate-700 rounded-lg px-3 py-2 text-sm mb-2"
            />
            <label className="block text-xs font-medium text-slate-400 mb-1">Keyword cluster (optional, comma separated)</label>
            <input
              value={topicKeywords}
              onChange={(e) => setTopicKeywords(e.target.value)}
              className="w-full bg-black border border-slate-700 rounded-lg px-3 py-2 text-sm mb-2"
            />
            <div className="flex gap-2 mb-2 flex-wrap">
              <select
                value={topicCadence}
                onChange={(e) => setTopicCadence(e.target.value as ContentTopicCadence)}
                className="bg-black border border-slate-700 rounded-lg px-3 py-2 text-sm"
              >
                <option value="on_demand">On demand only</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
              {topicCadence === "weekly" && (
                <select
                  value={topicDayOfWeek}
                  onChange={(e) => setTopicDayOfWeek(Number(e.target.value))}
                  className="bg-black border border-slate-700 rounded-lg px-3 py-2 text-sm"
                >
                  {WEEKDAY_LABELS.map((label, i) => (
                    <option key={i} value={i}>
                      {label}
                    </option>
                  ))}
                </select>
              )}
              {topicCadence === "monthly" && (
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={topicDayOfMonth}
                  onChange={(e) => setTopicDayOfMonth(Number(e.target.value))}
                  className="bg-black border border-slate-700 rounded-lg px-3 py-2 text-sm w-24"
                />
              )}
              {topicCadence !== "on_demand" && (
                <select
                  value={topicHourUtc}
                  onChange={(e) => setTopicHourUtc(Number(e.target.value))}
                  className="bg-black border border-slate-700 rounded-lg px-3 py-2 text-sm"
                >
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>
                      {String(h).padStart(2, "0")}:00 UTC
                    </option>
                  ))}
                </select>
              )}
            </div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Target social brand (optional)</label>
            <select
              value={topicSocialBrandId}
              onChange={(e) => setTopicSocialBrandId(e.target.value)}
              className="w-full bg-black border border-slate-700 rounded-lg px-3 py-2 text-sm mb-3"
            >
              <option value="">(none)</option>
              {socialBrands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            <button
              onClick={createTopic}
              disabled={creatingTopic || !topicText.trim()}
              className="px-4 py-2 rounded-lg bg-sky-700 text-white text-sm font-medium hover:bg-sky-800 transition-colors disabled:opacity-50 mb-4"
            >
              {creatingTopic ? "Saving…" : "Add to calendar"}
            </button>

            {activeTopics.length > 0 && (
              <div className="border-t border-slate-800 pt-3 space-y-2">
                {activeTopics.map((t) => (
                  <div key={t.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-slate-300">
                      {productLabel(t.product)} — {t.topic} ({t.cadence}
                      {t.next_run_at ? `, next ${new Date(t.next_run_at).toLocaleDateString()}` : ""})
                    </span>
                    <button
                      onClick={() => cancelTopic(t.id)}
                      disabled={busyTopicIds.has(t.id)}
                      className="text-red-400 hover:underline disabled:opacity-50 shrink-0"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <section className="bg-[#0d0d0d] rounded-2xl border border-green-600 overflow-hidden mb-8">
          <div className="px-6 py-4 border-b border-slate-800">
            <h2 className="font-semibold text-white">Source items</h2>
          </div>
          {items.length === 0 ? (
            <p className="text-sm text-slate-500 p-6">No content items yet.</p>
          ) : (
            <div className="divide-y divide-slate-800">
              {items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setSelectedItemId(item.id)}
                  className={`w-full text-left px-6 py-3 hover:bg-slate-900/50 transition-colors ${selectedItemId === item.id ? "bg-slate-900/60" : ""}`}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm text-white">{item.title}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {productLabel(item.product)} · {item.source_type} · {new Date(item.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full shrink-0 ${STATUS_STYLE[item.status]}`}>
                      {item.status}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        {selectedItemId && (
          <section className="bg-[#0d0d0d] rounded-2xl border border-sky-700 p-6">
            <h2 className="font-semibold text-white mb-3">Generate derivatives</h2>
            <div className="flex gap-2 mb-3 flex-wrap">
              {CHANNELS.map((c) => (
                <button
                  key={c.value}
                  onClick={() => toggleChannel(c.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium ${genChannels.has(c.value) ? "bg-sky-700 text-white" : "bg-black border border-slate-700 text-slate-400"}`}
                >
                  {c.label}
                </button>
              ))}
            </div>

            {genChannels.has("social") && (
              <>
                <label className="block text-xs font-medium text-slate-400 mb-1">Social brand</label>
                <select
                  value={genSocialBrandId}
                  onChange={(e) => setGenSocialBrandId(e.target.value)}
                  className="w-full bg-black border border-slate-700 rounded-lg px-3 py-2 text-sm mb-3"
                >
                  <option value="">Select a brand…</option>
                  {socialBrands.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </>
            )}

            <label className="block text-xs font-medium text-slate-400 mb-1">Autonomy</label>
            <select
              value={genAutonomy}
              onChange={(e) => setGenAutonomy(e.target.value as MarketingAutonomy)}
              className="w-full bg-black border border-slate-700 rounded-lg px-3 py-2 text-sm mb-4"
            >
              <option value="manual">Manual — hold every derivative for review</option>
              <option value="auto">Auto — publish/send where each channel's own quality/risk bar allows</option>
            </select>

            <button
              onClick={generateDerivatives}
              disabled={generating || genChannels.size === 0 || (genChannels.has("social") && !genSocialBrandId)}
              className="px-4 py-2 rounded-lg bg-sky-700 text-white text-sm font-medium hover:bg-sky-800 transition-colors disabled:opacity-50 mb-6"
            >
              {generating ? "Generating…" : "Generate"}
            </button>

            <h3 className="font-semibold text-white mb-2 text-sm">Derivatives</h3>
            {loadingDerivatives ? (
              <p className="text-sm text-slate-500">Loading…</p>
            ) : derivatives.length === 0 ? (
              <p className="text-sm text-slate-500">None generated yet.</p>
            ) : (
              <div className="divide-y divide-slate-800 border-t border-slate-800">
                {derivatives.map((d) => (
                  <div key={d.id} className="py-3 flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm text-white">
                        {d.channel}
                        {d.platform ? ` · ${d.platform}` : ""} {d.subject ? `— ${d.subject}` : ""}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5 max-w-md truncate">{d.body}</p>
                      {d.error && <p className="text-xs text-red-400 mt-0.5">{d.error}</p>}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${STATUS_STYLE[d.status]}`}>{d.status}</span>
                      {d.status === "pending_review" && d.channel !== "social" && (
                        <button
                          onClick={() => approveDerivative(d.id)}
                          disabled={busyDerivativeIds.has(d.id)}
                          className="text-xs font-medium text-green-400 hover:underline disabled:opacity-50"
                        >
                          {busyDerivativeIds.has(d.id) ? "Working…" : "Approve"}
                        </button>
                      )}
                      {d.status === "pending_review" && d.channel === "social" && (
                        <a href="/admin/social" className="text-xs font-medium text-sky-400 hover:underline">
                          Review in Social →
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
