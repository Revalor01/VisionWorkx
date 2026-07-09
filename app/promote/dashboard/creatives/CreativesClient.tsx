"use client";

import { useState } from "react";
import type { PromoteCreative, PromoteCreativeStatus } from "@/lib/database.types";
import type { AdObjective, AdTone } from "@/lib/promote/copyGenerator";
import { TEMPLATES, type TemplateId } from "@/lib/promote/templates";

const OBJECTIVES: { id: AdObjective; label: string }[] = [
  { id: "awareness", label: "Awareness" },
  { id: "leads", label: "Get Leads" },
  { id: "bookings", label: "Drive Bookings" },
  { id: "promotion", label: "Promote Offer" },
];

const TONES: { id: AdTone; label: string }[] = [
  { id: "professional", label: "Professional" },
  { id: "friendly", label: "Friendly" },
  { id: "urgent", label: "Urgent" },
  { id: "premium", label: "Premium" },
];

const COUNTS = [3, 6, 9];

export default function CreativesClient({ initialCreatives }: { initialCreatives: PromoteCreative[] }) {
  const [creatives, setCreatives] = useState(initialCreatives);
  const [statusFilter, setStatusFilter] = useState<"all" | PromoteCreativeStatus>("all");
  const [modalOpen, setModalOpen] = useState(false);

  const [objective, setObjective] = useState<AdObjective>("bookings");
  const [tone, setTone] = useState<AdTone>("friendly");
  const [templateIds, setTemplateIds] = useState<TemplateId[]>(["bold-header"]);
  const [count, setCount] = useState(3);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  function toggleTemplate(id: TemplateId) {
    setTemplateIds((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));
  }

  async function handleGenerate() {
    if (templateIds.length === 0) {
      setError("Select at least one template");
      return;
    }
    setGenerating(true);
    setError("");
    try {
      const res = await fetch("/api/promote/creatives/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ objective, tone, templateIds, count }),
      });
      const body = await res.json();
      if (!res.ok) {
        if (body.error === "PLAN_LIMIT") throw new Error(body.message ?? "Plan limit reached — upgrade to generate more");
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }

      const refreshed = await fetch("/api/promote/creatives").then((r) => r.json());
      setCreatives(refreshed.creatives ?? []);
      setModalOpen(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  async function archiveCreative(id: string) {
    setCreatives((prev) => prev.map((c) => (c.id === id ? { ...c, status: "archived" } : c)));
    await fetch(`/api/promote/creatives/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "archived" }),
    }).catch(() => {});
  }

  const filtered = creatives.filter((c) => statusFilter === "all" || c.status === statusFilter);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold mb-1">Ad Creatives</h1>
          <p className="text-promote-muted text-sm">AI-generated copy + rendered creative images.</p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="px-5 py-3 rounded-xl bg-promote-accent text-white text-sm font-semibold hover:opacity-90 transition-opacity"
        >
          Generate New Ads
        </button>
      </div>

      <div className="flex gap-2 mb-6">
        {(["all", "draft", "approved", "archived"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium capitalize transition-colors ${
              statusFilter === s ? "bg-promote-accent text-white" : "bg-promote-bg2 border border-promote-border text-promote-muted"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-promote-bg2 border border-dashed border-promote-border rounded-xl p-10 text-center text-promote-muted text-sm">
          No creatives{statusFilter !== "all" ? ` with status "${statusFilter}"` : ""} yet.
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-4">
          {filtered.map((c) => (
            <div key={c.id} className="bg-promote-bg2 border border-promote-border rounded-xl overflow-hidden flex flex-col">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={c.image_url} alt={c.headline} className="w-full aspect-square object-cover" />
              <div className="p-3 flex-1 flex flex-col">
                <p className="text-sm font-medium">{c.headline}</p>
                <p className="text-xs text-promote-muted mt-1 line-clamp-2">{c.body_text}</p>
                <div className="mt-auto pt-3 flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-promote-muted capitalize">{c.status}</span>
                  <div className="flex gap-2">
                    <a href={c.image_url} download target="_blank" rel="noreferrer" className="text-xs text-promote-accent hover:underline">
                      Download
                    </a>
                    {c.status !== "archived" && (
                      <button onClick={() => archiveCreative(c.id)} className="text-xs text-promote-red hover:underline">
                        Archive
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-promote-bg2 border border-promote-border rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold mb-4">Generate ad creatives</h2>

            {error && <div className="mb-4 p-3 rounded-xl bg-promote-red/10 border border-promote-red/30 text-promote-red text-sm">{error}</div>}

            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium mb-2">Objective</label>
                <div className="grid grid-cols-2 gap-2">
                  {OBJECTIVES.map((o) => (
                    <button key={o.id} onClick={() => setObjective(o.id)} className={`py-2 rounded-xl text-sm border transition-colors ${objective === o.id ? "border-promote-accent bg-promote-accent/10 text-promote-accent" : "border-promote-border text-promote-muted"}`}>
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Tone</label>
                <div className="grid grid-cols-2 gap-2">
                  {TONES.map((t) => (
                    <button key={t.id} onClick={() => setTone(t.id)} className={`py-2 rounded-xl text-sm border transition-colors ${tone === t.id ? "border-promote-accent bg-promote-accent/10 text-promote-accent" : "border-promote-border text-promote-muted"}`}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Templates</label>
                <div className="grid grid-cols-2 gap-2">
                  {TEMPLATES.map((t) => (
                    <button key={t.id} onClick={() => toggleTemplate(t.id)} className={`p-3 rounded-xl text-left text-xs border transition-colors ${templateIds.includes(t.id) ? "border-promote-accent bg-promote-accent/10" : "border-promote-border text-promote-muted"}`}>
                      <p className="font-medium text-promote-text">{t.label}</p>
                      <p className="text-promote-muted mt-0.5">{t.bestFor}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Number of variants</label>
                <div className="flex gap-2">
                  {COUNTS.map((n) => (
                    <button key={n} onClick={() => setCount(n)} className={`flex-1 py-2 rounded-xl text-sm border transition-colors ${count === n ? "border-promote-accent bg-promote-accent/10 text-promote-accent" : "border-promote-border text-promote-muted"}`}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button onClick={() => setModalOpen(false)} disabled={generating} className="px-5 py-3 rounded-xl border border-promote-border text-sm font-medium disabled:opacity-50">
                Cancel
              </button>
              <button onClick={handleGenerate} disabled={generating} className="flex-1 bg-promote-accent text-white font-semibold py-3 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60">
                {generating ? "Generating…" : "Generate"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
