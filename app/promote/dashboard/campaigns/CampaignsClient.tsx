"use client";

import { useState } from "react";
import type {
  PromoteCampaign,
  PromoteCampaignObjective,
  PromoteCampaignPlatform,
  PromoteCreative,
} from "@/lib/database.types";

const PLATFORMS: { id: PromoteCampaignPlatform; label: string }[] = [
  { id: "meta", label: "Meta (Facebook/Instagram)" },
  { id: "google", label: "Google Ads" },
  { id: "both", label: "Both" },
];

const OBJECTIVES: { id: PromoteCampaignObjective; label: string }[] = [
  { id: "awareness", label: "Awareness" },
  { id: "traffic", label: "Traffic" },
  { id: "leads", label: "Leads" },
  { id: "conversions", label: "Conversions" },
];

const RADII = [1, 3, 5, 10, 20];

interface BuilderState {
  name: string;
  platform: PromoteCampaignPlatform;
  objective: PromoteCampaignObjective;
  creativeIds: string[];
  location: string;
  radius: number;
  ageMin: number;
  ageMax: number;
  genders: ("all" | "men" | "women")[];
  interests: string;
  dailyBudget: number;
  startDate: string;
  endDate: string;
}

const DEFAULT_BUILDER: BuilderState = {
  name: "",
  platform: "meta",
  objective: "leads",
  creativeIds: [],
  location: "",
  radius: 5,
  ageMin: 18,
  ageMax: 65,
  genders: ["all"],
  interests: "",
  dailyBudget: 15,
  startDate: new Date().toISOString().slice(0, 10),
  endDate: "",
};

export default function CampaignsClient({
  initialCampaigns,
  availableCreatives,
}: {
  initialCampaigns: PromoteCampaign[];
  availableCreatives: PromoteCreative[];
}) {
  const [campaigns, setCampaigns] = useState(initialCampaigns);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [builderStep, setBuilderStep] = useState(1);
  const [builder, setBuilder] = useState<BuilderState>(DEFAULT_BUILDER);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function update<K extends keyof BuilderState>(field: K, value: BuilderState[K]) {
    setBuilder((prev) => ({ ...prev, [field]: value }));
  }

  function toggleCreative(id: string) {
    setBuilder((prev) => ({
      ...prev,
      creativeIds: prev.creativeIds.includes(id) ? prev.creativeIds.filter((c) => c !== id) : [...prev.creativeIds, id],
    }));
  }

  async function handleCreate() {
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/promote/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: builder.name,
          platform: builder.platform,
          objective: builder.objective,
          dailyBudget: builder.dailyBudget,
          startDate: builder.startDate,
          endDate: builder.endDate || undefined,
          targetAudience: {
            ageMin: builder.ageMin,
            ageMax: builder.ageMax,
            genders: builder.genders,
            interests: builder.interests.split(",").map((s) => s.trim()).filter(Boolean),
            radius: builder.radius,
            location: builder.location,
          },
          creativeIds: builder.creativeIds,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        if (body.error === "PLAN_LIMIT") throw new Error(body.message ?? "Your plan doesn't include this platform");
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }

      const refreshed = await fetch("/api/promote/campaigns").then((r) => r.json());
      setCampaigns(refreshed.campaigns ?? []);
      setSheetOpen(false);
      setBuilder(DEFAULT_BUILDER);
      setBuilderStep(1);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePublish(id: string) {
    const res = await fetch(`/api/promote/campaigns/${id}/publish`, { method: "POST" });
    const body = await res.json();
    if (res.ok) {
      setCampaigns((prev) => prev.map((c) => (c.id === id ? { ...c, status: "pending_platform_approval" } : c)));
      alert(body.message);
    } else {
      alert(body.error ?? "Failed to submit campaign");
    }
  }

  async function handlePause(id: string, currentStatus: string) {
    const nextStatus = currentStatus === "paused" ? "pending_platform_approval" : "paused";
    await fetch(`/api/promote/campaigns/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });
    setCampaigns((prev) => prev.map((c) => (c.id === id ? { ...c, status: nextStatus as PromoteCampaign["status"] } : c)));
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this draft campaign?")) return;
    const res = await fetch(`/api/promote/campaigns/${id}`, { method: "DELETE" });
    if (res.ok) setCampaigns((prev) => prev.filter((c) => c.id !== id));
  }

  const canAdvance =
    (builderStep === 1 && builder.name.trim() !== "") ||
    (builderStep === 2 && builder.creativeIds.length > 0) ||
    builderStep === 3 ||
    (builderStep === 4 && builder.dailyBudget >= 5 && builder.startDate);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold mb-1">Campaigns</h1>
          <p className="text-promote-muted text-sm">
            &ldquo;Submit&rdquo; saves and queues for platform approval — Meta/Google publishing is pending advertising API access.
          </p>
        </div>
        <button onClick={() => setSheetOpen(true)} className="px-5 py-3 rounded-xl bg-promote-accent text-white text-sm font-semibold hover:opacity-90 transition-opacity">
          New Campaign
        </button>
      </div>

      {campaigns.length === 0 ? (
        <div className="bg-promote-bg2 border border-dashed border-promote-border rounded-xl p-10 text-center text-promote-muted text-sm">
          No campaigns yet.
        </div>
      ) : (
        <div className="bg-promote-bg2 border border-promote-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-promote-bg3 text-left text-xs uppercase tracking-wide text-promote-muted">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Platform</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Daily Budget</th>
                <th className="px-4 py-3">Spend</th>
                <th className="px-4 py-3">Clicks</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-promote-border">
              {campaigns.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-3 font-medium">{c.name}</td>
                  <td className="px-4 py-3 capitalize">{c.platform}</td>
                  <td className="px-4 py-3">
                    <CampaignStatusBadge status={c.status} />
                  </td>
                  <td className="px-4 py-3">${Number(c.daily_budget).toFixed(2)}</td>
                  <td className="px-4 py-3">${Number(c.total_spend).toFixed(2)}</td>
                  <td className="px-4 py-3">{c.clicks}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-3">
                      {c.status === "draft" && (
                        <>
                          <button onClick={() => handlePublish(c.id)} className="text-promote-accent hover:underline">Submit</button>
                          <button onClick={() => handleDelete(c.id)} className="text-promote-red hover:underline">Delete</button>
                        </>
                      )}
                      {(c.status === "pending_platform_approval" || c.status === "paused") && (
                        <button onClick={() => handlePause(c.id, c.status)} className="text-promote-accent hover:underline">
                          {c.status === "paused" ? "Resume" : "Pause"}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {sheetOpen && (
        <div className="fixed inset-0 bg-black/60 flex justify-end z-50">
          <div className="bg-promote-bg2 border-l border-promote-border w-full max-w-md h-full overflow-y-auto p-6">
            <h2 className="text-lg font-bold mb-1">New campaign</h2>
            <p className="text-xs text-promote-muted mb-6">Step {builderStep} of 4</p>

            {error && <div className="mb-4 p-3 rounded-xl bg-promote-red/10 border border-promote-red/30 text-promote-red text-sm">{error}</div>}

            {builderStep === 1 && (
              <div className="space-y-4">
                <Field label="Campaign name">
                  <input value={builder.name} onChange={(e) => update("name", e.target.value)} placeholder="Summer Promotion" className={inputCls} />
                </Field>
                <Field label="Platform">
                  <div className="space-y-2">
                    {PLATFORMS.map((p) => (
                      <button key={p.id} onClick={() => update("platform", p.id)} className={`w-full text-left px-4 py-2.5 rounded-xl border text-sm transition-colors ${builder.platform === p.id ? "border-promote-accent bg-promote-accent/10" : "border-promote-border"}`}>
                        {p.label}
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label="Objective">
                  <div className="grid grid-cols-2 gap-2">
                    {OBJECTIVES.map((o) => (
                      <button key={o.id} onClick={() => update("objective", o.id)} className={`py-2 rounded-xl text-sm border transition-colors ${builder.objective === o.id ? "border-promote-accent bg-promote-accent/10" : "border-promote-border"}`}>
                        {o.label}
                      </button>
                    ))}
                  </div>
                </Field>
              </div>
            )}

            {builderStep === 2 && (
              <div>
                <p className="text-sm mb-3">Select creatives ({builder.creativeIds.length} selected)</p>
                {availableCreatives.length === 0 ? (
                  <p className="text-sm text-promote-muted">No creatives available — generate some first.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {availableCreatives.map((c) => (
                      <button key={c.id} onClick={() => toggleCreative(c.id)} className={`rounded-xl border overflow-hidden text-left transition-colors ${builder.creativeIds.includes(c.id) ? "border-promote-accent" : "border-promote-border"}`}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={c.image_url} alt={c.headline} className="w-full aspect-square object-cover" />
                        <p className="text-xs p-2 truncate">{c.headline}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {builderStep === 3 && (
              <div className="space-y-4">
                <Field label="Location"><input value={builder.location} onChange={(e) => update("location", e.target.value)} placeholder="Atlanta, GA" className={inputCls} /></Field>
                <Field label="Radius (miles)">
                  <div className="flex gap-2">
                    {RADII.map((r) => (
                      <button key={r} onClick={() => update("radius", r)} className={`flex-1 py-2 rounded-xl text-sm border transition-colors ${builder.radius === r ? "border-promote-accent bg-promote-accent/10" : "border-promote-border"}`}>
                        {r}mi
                      </button>
                    ))}
                  </div>
                </Field>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Min age"><input type="number" value={builder.ageMin} onChange={(e) => update("ageMin", Number(e.target.value))} className={inputCls} /></Field>
                  <Field label="Max age"><input type="number" value={builder.ageMax} onChange={(e) => update("ageMax", Number(e.target.value))} className={inputCls} /></Field>
                </div>
                <Field label="Gender">
                  <div className="flex gap-2">
                    {(["all", "men", "women"] as const).map((g) => (
                      <button key={g} onClick={() => update("genders", [g])} className={`flex-1 py-2 rounded-xl text-sm border capitalize transition-colors ${builder.genders[0] === g ? "border-promote-accent bg-promote-accent/10" : "border-promote-border"}`}>
                        {g}
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label="Interests (comma-separated)"><input value={builder.interests} onChange={(e) => update("interests", e.target.value)} placeholder="fitness, haircuts" className={inputCls} /></Field>
              </div>
            )}

            {builderStep === 4 && (
              <div className="space-y-4">
                <Field label="Daily budget ($, min $5)"><input type="number" min={5} value={builder.dailyBudget} onChange={(e) => update("dailyBudget", Number(e.target.value))} className={inputCls} /></Field>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Start date"><input type="date" value={builder.startDate} onChange={(e) => update("startDate", e.target.value)} className={inputCls} /></Field>
                  <Field label="End date (optional)"><input type="date" value={builder.endDate} onChange={(e) => update("endDate", e.target.value)} className={inputCls} /></Field>
                </div>
                <div className="p-4 bg-promote-bg3 rounded-xl text-sm space-y-1">
                  <p><strong>{builder.name || "Untitled campaign"}</strong> · {builder.platform} · {builder.objective}</p>
                  <p className="text-promote-muted">{builder.creativeIds.length} creative(s) · {builder.location || "no location set"} · {builder.radius}mi radius</p>
                  <p className="text-promote-muted">${builder.dailyBudget}/day starting {builder.startDate}</p>
                </div>
              </div>
            )}

            <div className="mt-8 flex gap-3">
              {builderStep > 1 && (
                <button onClick={() => setBuilderStep((s) => s - 1)} className="px-5 py-3 rounded-xl border border-promote-border text-sm font-medium">Back</button>
              )}
              {builderStep < 4 ? (
                <button onClick={() => setBuilderStep((s) => s + 1)} disabled={!canAdvance} className="flex-1 bg-promote-accent text-white font-semibold py-3 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-40">
                  Next
                </button>
              ) : (
                <button onClick={handleCreate} disabled={submitting || !canAdvance} className="flex-1 bg-promote-accent text-white font-semibold py-3 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60">
                  {submitting ? "Saving…" : "Save Campaign"}
                </button>
              )}
              <button onClick={() => setSheetOpen(false)} className="px-3 text-promote-muted text-sm">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const inputCls =
  "w-full bg-promote-bg3 border border-promote-border rounded-xl px-4 py-2.5 text-sm text-promote-text focus:outline-none focus:ring-2 focus:ring-promote-accent focus:border-transparent placeholder:text-promote-muted";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function CampaignStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft: "bg-promote-muted/20 text-promote-muted",
    pending_platform_approval: "bg-promote-gold/20 text-promote-gold",
    paused: "bg-promote-border text-promote-muted",
    completed: "bg-promote-green/20 text-promote-green",
  };
  const labels: Record<string, string> = {
    draft: "Draft",
    pending_platform_approval: "Pending Approval",
    paused: "Paused",
    completed: "Completed",
  };
  return (
    <span className={`inline-block text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${styles[status] ?? styles.draft}`}>
      {labels[status] ?? status}
    </span>
  );
}
