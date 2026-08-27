"use client";

import { useEffect, useState } from "react";
import type { MarketingCampaign, MarketingProduct, MarketingRecurrence, MarketingRecurringSchedule } from "@/lib/database.types";
import { MARKETING_PRODUCTS } from "@/lib/marketing/products";
import { PUSH_TITLE_MAX, PUSH_BODY_MAX, SMS_BODY_MAX } from "@/lib/mobile/limits";

type MobileChannel = "push" | "sms";

const PRODUCTS: { value: MarketingProduct; label: string }[] = MARKETING_PRODUCTS.map((p) => ({
  value: p.slug,
  label: p.name,
}));

const WEEKDAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function productLabel(p: MarketingProduct): string {
  return PRODUCTS.find((x) => x.value === p)?.label ?? p;
}

const STATUS_STYLE: Record<MarketingCampaign["status"], string> = {
  draft: "bg-slate-700 text-slate-200",
  scheduled: "bg-sky-900/60 text-sky-300",
  generated: "bg-slate-700 text-slate-200",
  pending_review: "bg-amber-900/60 text-amber-300",
  sending: "bg-amber-900/60 text-amber-300",
  sent: "bg-green-900/60 text-green-300",
  failed: "bg-red-900/60 text-red-300",
  canceled: "bg-slate-800 text-slate-500",
};

function CharCount({ value, max }: { value: string; max: number }) {
  const over = value.length > max;
  return <span className={over ? "text-red-400" : "text-slate-500"}>{value.length}/{max}</span>;
}

export default function MobileDashboard({ initialCampaigns }: { initialCampaigns: MarketingCampaign[] }) {
  const [campaigns, setCampaigns] = useState(initialCampaigns);
  const [schedules, setSchedules] = useState<MarketingRecurringSchedule[]>([]);
  const [product, setProduct] = useState<MarketingProduct>("visionworkx");
  const [channel, setChannel] = useState<MobileChannel>("push");
  const [audienceCount, setAudienceCount] = useState<number | null>(null);
  const [loadingAudience, setLoadingAudience] = useState(false);

  const [goal, setGoal] = useState("");
  const [voiceNotes, setVoiceNotes] = useState("");
  const [title, setTitle] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [generating, setGenerating] = useState(false);

  const [savedCampaignId, setSavedCampaignId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [confirmSend, setConfirmSend] = useState(false);
  const [targetInput, setTargetInput] = useState("");
  const [sendingTargeted, setSendingTargeted] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // "Schedule or automate" — a lightweight parallel form, same pattern as
  // MarketingDashboard's. Doesn't generate content up front; the mobile
  // cron (app/api/cron/mobile) generates the draft when it's due.
  const [schedMode, setSchedMode] = useState<"once" | "recurring">("once");
  const [schedGoal, setSchedGoal] = useState("");
  const [schedVoiceNotes, setSchedVoiceNotes] = useState("");
  const [schedAutonomy, setSchedAutonomy] = useState<"manual" | "auto">("manual");
  const [schedRunAt, setSchedRunAt] = useState("");
  const [schedRecurrence, setSchedRecurrence] = useState<MarketingRecurrence>("weekly");
  const [schedDayOfWeek, setSchedDayOfWeek] = useState(1);
  const [schedDayOfMonth, setSchedDayOfMonth] = useState(1);
  const [schedHourUtc, setSchedHourUtc] = useState(14);
  const [scheduling, setScheduling] = useState(false);
  const [schedError, setSchedError] = useState("");
  const [schedMessage, setSchedMessage] = useState("");

  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadAudience(product, channel);
    setConfirmSend(false);
  }, [product, channel]);

  useEffect(() => {
    refreshSchedules();
  }, []);

  async function loadAudience(p: MarketingProduct, c: MobileChannel) {
    setLoadingAudience(true);
    setAudienceCount(null);
    try {
      const res = await fetch(`/api/admin/mobile/audience?product=${p}&channel=${c}`);
      const body = await res.json();
      if (res.ok) setAudienceCount(body.count);
    } finally {
      setLoadingAudience(false);
    }
  }

  async function refreshCampaigns() {
    const res = await fetch("/api/admin/mobile/campaigns");
    const body = await res.json();
    if (res.ok) setCampaigns(body.campaigns);
  }

  async function refreshSchedules() {
    const res = await fetch("/api/admin/marketing/recurring");
    const body = await res.json();
    if (res.ok) setSchedules((body.schedules as MarketingRecurringSchedule[]).filter((s) => s.channel !== "email"));
  }

  async function generate() {
    setGenerating(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/admin/mobile/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product, channel, goal, voiceNotes: voiceNotes || undefined }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      if (channel === "push") setTitle(body.title);
      setBodyText(body.body);
      setSavedCampaignId(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  async function saveDraft(): Promise<string | null> {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/admin/mobile/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product, channel, title, bodyText }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setSavedCampaignId(body.campaign.id);
      setCampaigns((prev) => [body.campaign, ...prev]);
      return body.campaign.id as string;
    } catch (err) {
      setError((err as Error).message);
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function sendReal() {
    if (!confirmSend) {
      setConfirmSend(true);
      return;
    }
    setSending(true);
    setError("");
    setMessage("");
    try {
      const id = savedCampaignId ?? (await saveDraft());
      if (!id) return;
      const res = await fetch(`/api/admin/mobile/campaigns/${id}/send`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setMessage(
        body.recipientCount === 0
          ? "Sent to 0 recipients — no opted-in audience exists for this product/channel yet."
          : `Sent to ${body.sent} of ${body.recipientCount} recipients${body.failed ? ` (${body.failed} failed)` : ""}.`
      );
      setConfirmSend(false);
      await refreshCampaigns();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  }

  async function sendTargeted() {
    const targets = targetInput
      .split(/[,\n]/)
      .map((t) => t.trim())
      .filter(Boolean);
    if (targets.length === 0) return;

    setSendingTargeted(true);
    setError("");
    setMessage("");
    try {
      const id = savedCampaignId ?? (await saveDraft());
      if (!id) return;
      const res = await fetch(`/api/admin/mobile/campaigns/${id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targets }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setMessage(`Sent to ${body.sent} of ${body.recipientCount} target(s)${body.failed ? ` (${body.failed} failed)` : ""}.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSendingTargeted(false);
    }
  }

  async function createSchedule() {
    setScheduling(true);
    setSchedError("");
    setSchedMessage("");
    try {
      if (schedMode === "once") {
        if (!schedRunAt) throw new Error("Pick a date/time");
        const res = await fetch("/api/admin/marketing/schedule", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            product,
            channel,
            goal: schedGoal,
            voiceNotes: schedVoiceNotes || undefined,
            runAt: new Date(schedRunAt).toISOString(),
            autonomy: schedAutonomy,
          }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
        setSchedMessage(`Scheduled for ${new Date(body.campaign.run_at).toLocaleString()}.`);
        setCampaigns((prev) => [body.campaign, ...prev]);
      } else {
        const res = await fetch("/api/admin/marketing/recurring", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            product,
            channel,
            goal: schedGoal,
            voiceNotes: schedVoiceNotes || undefined,
            recurrence: schedRecurrence,
            dayOfWeek: schedRecurrence === "weekly" ? schedDayOfWeek : undefined,
            dayOfMonth: schedRecurrence === "monthly" ? schedDayOfMonth : undefined,
            hourUtc: schedHourUtc,
            autonomy: schedAutonomy,
          }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
        setSchedMessage(`Recurring ${channel} created — next run ${new Date(body.schedule.next_run_at).toLocaleString()}.`);
        setSchedules((prev) => [...prev, body.schedule].sort((a, b) => a.next_run_at.localeCompare(b.next_run_at)));
      }
      setSchedGoal("");
      setSchedVoiceNotes("");
      setSchedRunAt("");
    } catch (err) {
      setSchedError((err as Error).message);
    } finally {
      setScheduling(false);
    }
  }

  function withBusy(id: string, fn: () => Promise<void>) {
    return async () => {
      setBusyIds((prev) => new Set(prev).add(id));
      try {
        await fn();
      } finally {
        setBusyIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    };
  }

  async function cancelCampaign(id: string) {
    const res = await fetch(`/api/admin/marketing/campaigns/${id}/cancel`, { method: "POST" });
    const body = await res.json();
    if (!res.ok) {
      setError(body.error ?? `HTTP ${res.status}`);
      return;
    }
    await refreshCampaigns();
  }

  async function approveCampaign(id: string) {
    const res = await fetch(`/api/admin/marketing/campaigns/${id}/approve`, { method: "POST" });
    const body = await res.json();
    if (!res.ok) {
      setError(body.error ?? `HTTP ${res.status}`);
      return;
    }
    setMessage(`Approved and sent to ${body.sent} of ${body.recipientCount} recipients${body.failed ? ` (${body.failed} failed)` : ""}.`);
    await refreshCampaigns();
  }

  async function cancelSchedule(id: string) {
    const res = await fetch(`/api/admin/marketing/recurring/${id}/cancel`, { method: "POST" });
    const body = await res.json();
    if (!res.ok) {
      setError(body.error ?? `HTTP ${res.status}`);
      return;
    }
    await refreshSchedules();
  }

  const bodyMax = channel === "push" ? PUSH_BODY_MAX : SMS_BODY_MAX;
  const hasDraft = channel === "push" ? title || bodyText : !!bodyText;

  const pendingReview = campaigns.filter((c) => c.status === "pending_review");
  const upcomingOneOff = campaigns.filter((c) => c.status === "scheduled");
  const activeSchedules = schedules.filter((s) => s.active);

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="bg-[#1A3A5C] text-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold tracking-tight">Revalor</span>
          <span className="text-xs bg-black/20 px-2 py-0.5 rounded-full font-medium">Mobile Marketing</span>
        </div>
        <a href="/admin/marketing" className="text-xs text-white/70 hover:text-white transition-colors">
          ← Email Marketing
        </a>
      </header>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <h1 className="text-2xl font-bold text-white mb-1">Mobile Marketing</h1>
        <p className="text-slate-400 text-sm mb-8">
          Push and SMS to real users of Revalor&apos;s own products — opted-in only. VisionWorkx users can opt in to SMS
          at /notifications; no product captures push tokens yet, and the other four don&apos;t capture SMS consent
          either (see the audience count below for each product/channel).
        </p>

        {pendingReview.length > 0 && (
          <section className="bg-[#0d0d0d] rounded-2xl border border-amber-600 overflow-hidden mb-8">
            <div className="px-6 py-4 border-b border-slate-800">
              <h2 className="font-semibold text-white">Pending review ({pendingReview.length})</h2>
              <p className="text-xs text-slate-500 mt-1">Autonomy is manual — these generated but need your approval before they send.</p>
            </div>
            <div className="divide-y divide-slate-800">
              {pendingReview.map((c) => (
                <div key={c.id} className="px-6 py-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm text-white">{c.subject || c.body_html || "(no content)"}</p>
                    <p className="text-xs text-slate-500 mt-0.5 capitalize">{c.product} · {c.channel}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <button
                      onClick={withBusy(c.id, () => approveCampaign(c.id))}
                      disabled={busyIds.has(c.id)}
                      className="text-xs font-medium text-green-400 hover:underline disabled:opacity-50"
                    >
                      {busyIds.has(c.id) ? "Working…" : "Approve & send"}
                    </button>
                    <button
                      onClick={withBusy(c.id, () => cancelCampaign(c.id))}
                      disabled={busyIds.has(c.id)}
                      className="text-xs font-medium text-red-400 hover:underline disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="bg-[#0d0d0d] rounded-2xl border border-green-600 p-6 mb-8">
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setChannel("push")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium ${channel === "push" ? "bg-[#1A3A5C] text-white" : "bg-black border border-slate-700 text-slate-400"}`}
            >
              Push
            </button>
            <button
              onClick={() => setChannel("sms")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium ${channel === "sms" ? "bg-[#1A3A5C] text-white" : "bg-black border border-slate-700 text-slate-400"}`}
            >
              SMS
            </button>
          </div>

          <label className="block text-xs font-medium text-slate-400 mb-1">Product</label>
          <select
            value={product}
            onChange={(e) => setProduct(e.target.value as MarketingProduct)}
            className="w-full bg-black border border-slate-700 rounded-lg px-3 py-2 text-sm mb-2"
          >
            {PRODUCTS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-slate-500 mb-4">
            {loadingAudience
              ? "Loading audience…"
              : audienceCount === null
                ? ""
                : `${audienceCount} opted-in recipient${audienceCount === 1 ? "" : "s"}${audienceCount === 0 ? " — TODO: no push tokens/SMS consent captured for this product yet" : ""}`}
          </p>

          <label className="block text-xs font-medium text-slate-400 mb-1">What&apos;s this message about?</label>
          <input
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="e.g. announcing the new weekly recap feature"
            className="w-full bg-black border border-slate-700 rounded-lg px-3 py-2 text-sm mb-3"
          />

          <label className="block text-xs font-medium text-slate-400 mb-1">Brand voice notes (optional)</label>
          <input
            value={voiceNotes}
            onChange={(e) => setVoiceNotes(e.target.value)}
            className="w-full bg-black border border-slate-700 rounded-lg px-3 py-2 text-sm mb-4"
          />

          <button
            onClick={generate}
            disabled={generating || !goal.trim()}
            className="px-4 py-2 rounded-lg bg-[#1A3A5C] text-white text-sm font-medium hover:bg-[#15304a] transition-colors disabled:opacity-50"
          >
            {generating ? "Generating…" : `Generate ${channel === "push" ? "push" : "SMS"}`}
          </button>
        </section>

        {hasDraft && (
          <section className="bg-[#0d0d0d] rounded-2xl border border-green-600 p-6 mb-8">
            {channel === "push" && (
              <>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-slate-400">Title</label>
                  <CharCount value={title} max={PUSH_TITLE_MAX} />
                </div>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-black border border-slate-700 rounded-lg px-3 py-2 text-sm mb-3"
                />
              </>
            )}

            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-slate-400">{channel === "push" ? "Body" : "Message"}</label>
              <CharCount value={bodyText} max={bodyMax} />
            </div>
            <textarea
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
              rows={channel === "push" ? 3 : 4}
              className="w-full bg-black border border-slate-700 rounded-lg px-3 py-2 text-sm mb-4"
            />

            {error && <div className="mb-3 p-2 rounded-lg bg-red-900/40 border border-red-700 text-red-300 text-sm">{error}</div>}
            {message && <div className="mb-3 p-2 rounded-lg bg-green-900/40 border border-green-700 text-green-300 text-sm">{message}</div>}

            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={saveDraft}
                disabled={saving || !bodyText.trim() || (channel === "push" && !title.trim())}
                className="text-xs font-medium text-sky-400 hover:underline disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save draft"}
              </button>
              <button
                onClick={sendReal}
                disabled={sending || !bodyText.trim() || (channel === "push" && !title.trim())}
                className={`text-xs font-medium hover:underline disabled:opacity-50 ${confirmSend ? "text-red-400" : "text-purple-400"}`}
              >
                {sending
                  ? "Sending…"
                  : confirmSend
                    ? `Confirm — send to all ${audienceCount ?? "?"} recipients`
                    : `Send to ${audienceCount ?? "?"} recipients`}
              </button>
              {confirmSend && (
                <button onClick={() => setConfirmSend(false)} className="text-xs font-medium text-slate-400 hover:underline">
                  Cancel
                </button>
              )}
            </div>

            <div className="mt-4 pt-4 border-t border-slate-800">
              <label className="block text-xs font-medium text-slate-400 mb-1">
                {channel === "push" ? "Send to specific Expo push token(s)" : "Send to specific phone number(s)"} instead
                (comma or newline separated) — the only real way to test this today
              </label>
              <textarea
                value={targetInput}
                onChange={(e) => setTargetInput(e.target.value)}
                rows={2}
                placeholder={channel === "push" ? "ExponentPushToken[xxxxxxxx]" : "+15551234567"}
                className="w-full bg-black border border-slate-700 rounded-lg px-3 py-2 text-sm mb-2"
              />
              <button
                onClick={sendTargeted}
                disabled={sendingTargeted || !targetInput.trim() || !bodyText.trim() || (channel === "push" && !title.trim())}
                className="text-xs font-medium text-teal-400 hover:underline disabled:opacity-50"
              >
                {sendingTargeted ? "Sending…" : "Send to these targets"}
              </button>
            </div>
          </section>
        )}

        <section className="bg-[#0d0d0d] rounded-2xl border border-sky-700 p-6 mb-8">
          <h2 className="font-semibold text-white mb-1">Schedule or automate</h2>
          <p className="text-xs text-slate-500 mb-4">
            Uses the {channel} channel and product selected above. Content is generated when it&apos;s due to send, not now.
          </p>

          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setSchedMode("once")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium ${schedMode === "once" ? "bg-sky-700 text-white" : "bg-black border border-slate-700 text-slate-400"}`}
            >
              One-off
            </button>
            <button
              onClick={() => setSchedMode("recurring")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium ${schedMode === "recurring" ? "bg-sky-700 text-white" : "bg-black border border-slate-700 text-slate-400"}`}
            >
              Recurring
            </button>
          </div>

          <label className="block text-xs font-medium text-slate-400 mb-1">What&apos;s this message about?</label>
          <input
            value={schedGoal}
            onChange={(e) => setSchedGoal(e.target.value)}
            placeholder={schedMode === "recurring" ? "e.g. weekly product digest (leave brief — recent activity fills the rest)" : "e.g. announcing the new weekly recap feature"}
            className="w-full bg-black border border-slate-700 rounded-lg px-3 py-2 text-sm mb-3"
          />

          <label className="block text-xs font-medium text-slate-400 mb-1">Brand voice notes (optional)</label>
          <input
            value={schedVoiceNotes}
            onChange={(e) => setSchedVoiceNotes(e.target.value)}
            className="w-full bg-black border border-slate-700 rounded-lg px-3 py-2 text-sm mb-3"
          />

          {schedMode === "once" ? (
            <>
              <label className="block text-xs font-medium text-slate-400 mb-1">Send at</label>
              <input
                type="datetime-local"
                value={schedRunAt}
                onChange={(e) => setSchedRunAt(e.target.value)}
                className="w-full bg-black border border-slate-700 rounded-lg px-3 py-2 text-sm mb-3"
              />
            </>
          ) : (
            <div className="flex gap-3 mb-3 flex-wrap">
              <select
                value={schedRecurrence}
                onChange={(e) => setSchedRecurrence(e.target.value as MarketingRecurrence)}
                className="bg-black border border-slate-700 rounded-lg px-3 py-2 text-sm"
              >
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
              {schedRecurrence === "weekly" ? (
                <select
                  value={schedDayOfWeek}
                  onChange={(e) => setSchedDayOfWeek(Number(e.target.value))}
                  className="bg-black border border-slate-700 rounded-lg px-3 py-2 text-sm"
                >
                  {WEEKDAY_LABELS.map((label, i) => (
                    <option key={i} value={i}>
                      {label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={schedDayOfMonth}
                  onChange={(e) => setSchedDayOfMonth(Number(e.target.value))}
                  className="bg-black border border-slate-700 rounded-lg px-3 py-2 text-sm w-24"
                  placeholder="Day (1-31)"
                />
              )}
              <select
                value={schedHourUtc}
                onChange={(e) => setSchedHourUtc(Number(e.target.value))}
                className="bg-black border border-slate-700 rounded-lg px-3 py-2 text-sm"
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, "0")}:00 UTC
                  </option>
                ))}
              </select>
            </div>
          )}

          <label className="block text-xs font-medium text-slate-400 mb-1">Autonomy</label>
          <select
            value={schedAutonomy}
            onChange={(e) => setSchedAutonomy(e.target.value as "manual" | "auto")}
            className="w-full bg-black border border-slate-700 rounded-lg px-3 py-2 text-sm mb-4"
          >
            <option value="manual">Manual — hold the generated draft for review</option>
            <option value="auto">Auto — send without review</option>
          </select>

          {schedError && <div className="mb-3 p-2 rounded-lg bg-red-900/40 border border-red-700 text-red-300 text-sm">{schedError}</div>}
          {schedMessage && <div className="mb-3 p-2 rounded-lg bg-green-900/40 border border-green-700 text-green-300 text-sm">{schedMessage}</div>}

          <button
            onClick={createSchedule}
            disabled={scheduling || !schedGoal.trim() || (schedMode === "once" && !schedRunAt)}
            className="px-4 py-2 rounded-lg bg-sky-700 text-white text-sm font-medium hover:bg-sky-800 transition-colors disabled:opacity-50"
          >
            {scheduling ? "Saving…" : schedMode === "once" ? "Schedule send" : "Create recurring digest"}
          </button>
        </section>

        {(upcomingOneOff.length > 0 || activeSchedules.length > 0) && (
          <section className="bg-[#0d0d0d] rounded-2xl border border-sky-800 overflow-hidden mb-8">
            <div className="px-6 py-4 border-b border-slate-800">
              <h2 className="font-semibold text-white">Scheduled &amp; recurring</h2>
            </div>
            <div className="divide-y divide-slate-800">
              {upcomingOneOff.map((c) => (
                <div key={c.id} className="px-6 py-3 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm text-white">{productLabel(c.product)} ({c.channel}) — {c.goal || "(no goal set)"}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      One-off · {c.run_at ? new Date(c.run_at).toLocaleString() : "—"} · autonomy: {c.autonomy}
                    </p>
                  </div>
                  <button
                    onClick={withBusy(c.id, () => cancelCampaign(c.id))}
                    disabled={busyIds.has(c.id)}
                    className="text-xs font-medium text-red-400 hover:underline disabled:opacity-50 shrink-0"
                  >
                    Cancel
                  </button>
                </div>
              ))}
              {activeSchedules.map((s) => (
                <div key={s.id} className="px-6 py-3 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm text-white">{productLabel(s.product)} ({s.channel}) — {s.goal}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {s.recurrence === "weekly" ? WEEKDAY_LABELS[s.day_of_week ?? 0] : `Day ${s.day_of_month} of month`} at{" "}
                      {String(s.hour_utc).padStart(2, "0")}:00 UTC · next {new Date(s.next_run_at).toLocaleString()} · autonomy: {s.autonomy}
                    </p>
                  </div>
                  <button
                    onClick={withBusy(s.id, () => cancelSchedule(s.id))}
                    disabled={busyIds.has(s.id)}
                    className="text-xs font-medium text-red-400 hover:underline disabled:opacity-50 shrink-0"
                  >
                    Cancel
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="bg-[#0d0d0d] rounded-2xl border border-green-600 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-800">
            <h2 className="font-semibold text-white">Campaign history</h2>
          </div>
          {campaigns.length === 0 ? (
            <p className="text-sm text-slate-500 p-6">No campaigns yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b border-slate-800">
                  <th className="px-6 py-2 font-medium">Product</th>
                  <th className="px-2 py-2 font-medium">Channel</th>
                  <th className="px-2 py-2 font-medium">Message</th>
                  <th className="px-2 py-2 font-medium">Status</th>
                  <th className="px-2 py-2 font-medium">Sent / Failed</th>
                  <th className="px-6 py-2 font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.id} className="border-b border-slate-800/50">
                    <td className="px-6 py-2.5 capitalize">{c.product}</td>
                    <td className="px-2 py-2.5 uppercase text-slate-400">{c.channel}</td>
                    <td className="px-2 py-2.5 text-slate-300">{c.subject || c.body_html || "—"}</td>
                    <td className="px-2 py-2.5">
                      <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${STATUS_STYLE[c.status]}`}>
                        {c.status}
                      </span>
                    </td>
                    <td className="px-2 py-2.5 text-slate-400">
                      {c.sent_count} / {c.failed_count}
                    </td>
                    <td className="px-6 py-2.5 text-slate-500">{new Date(c.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  );
}
