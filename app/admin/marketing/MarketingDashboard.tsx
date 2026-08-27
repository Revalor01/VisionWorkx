"use client";

import { useEffect, useState } from "react";
import type { MarketingAutonomy, MarketingCampaign, MarketingProduct, MarketingRecurrence, MarketingRecurringSchedule } from "@/lib/database.types";
import { MARKETING_PRODUCTS } from "@/lib/marketing/products";

const PRODUCTS: { value: MarketingProduct; label: string }[] = MARKETING_PRODUCTS.map((p) => ({
  value: p.slug,
  label: p.name,
}));

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

const WEEKDAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function productLabel(p: MarketingProduct): string {
  return PRODUCTS.find((x) => x.value === p)?.label ?? p;
}

export default function MarketingDashboard({
  initialCampaigns,
  initialSchedules,
}: {
  initialCampaigns: MarketingCampaign[];
  initialSchedules: MarketingRecurringSchedule[];
}) {
  const [campaigns, setCampaigns] = useState(initialCampaigns);
  const [schedules, setSchedules] = useState(initialSchedules);
  const [product, setProduct] = useState<MarketingProduct>("visionworkx");
  const [audienceCount, setAudienceCount] = useState<number | null>(null);
  const [loadingAudience, setLoadingAudience] = useState(false);

  const [goal, setGoal] = useState("");
  const [voiceNotes, setVoiceNotes] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [generating, setGenerating] = useState(false);

  const [savedCampaignId, setSavedCampaignId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [sending, setSending] = useState(false);
  const [confirmSend, setConfirmSend] = useState(false);
  const [targetedEmails, setTargetedEmails] = useState("");
  const [sendingTargeted, setSendingTargeted] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // "Schedule or automate" — a lightweight parallel form. It doesn't
  // generate content up front (unlike the "send now" flow above): the
  // cron route generates the draft when it comes due, so it always
  // reflects what's true about the product at send time.
  const [schedMode, setSchedMode] = useState<"once" | "recurring">("once");
  const [schedProduct, setSchedProduct] = useState<MarketingProduct>("visionworkx");
  const [schedGoal, setSchedGoal] = useState("");
  const [schedVoiceNotes, setSchedVoiceNotes] = useState("");
  const [schedAutonomy, setSchedAutonomy] = useState<MarketingAutonomy>("manual");
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
    loadAudience(product);
    setConfirmSend(false);
  }, [product]);

  async function loadAudience(p: MarketingProduct) {
    setLoadingAudience(true);
    setAudienceCount(null);
    try {
      const res = await fetch(`/api/admin/marketing/audience?product=${p}`);
      const body = await res.json();
      if (res.ok) setAudienceCount(body.count);
    } finally {
      setLoadingAudience(false);
    }
  }

  async function refreshCampaigns() {
    const res = await fetch("/api/admin/marketing/campaigns");
    const body = await res.json();
    if (res.ok) setCampaigns(body.campaigns);
  }

  async function refreshSchedules() {
    const res = await fetch("/api/admin/marketing/recurring");
    const body = await res.json();
    if (res.ok) setSchedules(body.schedules);
  }

  async function generate() {
    setGenerating(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/admin/marketing/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product, goal, voiceNotes: voiceNotes || undefined }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setSubject(body.subject);
      setBodyHtml(body.bodyHtml);
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
      const res = await fetch("/api/admin/marketing/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product, subject, bodyHtml }),
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

  async function sendTest() {
    setSendingTest(true);
    setError("");
    setMessage("");
    try {
      const id = savedCampaignId ?? (await saveDraft());
      if (!id) return;
      const res = await fetch(`/api/admin/marketing/campaigns/${id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testOnly: true }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setMessage("Test email sent to your own inbox — check it before sending to everyone.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSendingTest(false);
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
      const res = await fetch(`/api/admin/marketing/campaigns/${id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testOnly: false }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setMessage(`Sent to ${body.sent} of ${body.recipientCount} recipients${body.failed ? ` (${body.failed} failed)` : ""}.`);
      setConfirmSend(false);
      await refreshCampaigns();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  }

  async function sendTargeted() {
    const recipients = targetedEmails
      .split(/[,\n]/)
      .map((e) => e.trim())
      .filter(Boolean);
    if (recipients.length === 0) return;

    setSendingTargeted(true);
    setError("");
    setMessage("");
    try {
      const id = savedCampaignId ?? (await saveDraft());
      if (!id) return;
      const res = await fetch(`/api/admin/marketing/campaigns/${id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipients }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setMessage(
        `Sent to ${body.sent} of ${body.recipientCount} targeted recipient${body.recipientCount === 1 ? "" : "s"}${body.failed ? ` (${body.failed} failed)` : ""}${body.skipped ? ` — ${body.skipped} skipped (unsubscribed or invalid)` : ""}.`
      );
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
            product: schedProduct,
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
            product: schedProduct,
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
        setSchedMessage(`Recurring digest created — next run ${new Date(body.schedule.next_run_at).toLocaleString()}.`);
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

  const pendingReview = campaigns.filter((c) => c.status === "pending_review");
  const upcomingOneOff = campaigns.filter((c) => c.status === "scheduled");
  const activeSchedules = schedules.filter((s) => s.active && s.channel === "email");

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="bg-[#1A3A5C] text-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold tracking-tight">Revalor</span>
          <span className="text-xs bg-black/20 px-2 py-0.5 rounded-full font-medium">Email Marketing</span>
        </div>
        <div className="flex items-center gap-4">
          <a href="/admin/marketing/lifecycle" className="text-xs text-white/70 hover:text-white transition-colors">
            Lifecycle triggers →
          </a>
          <a href="https://revalor-admin.vercel.app" className="text-xs text-white/70 hover:text-white transition-colors">
            ← Back to Admin
          </a>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <h1 className="text-2xl font-bold text-white mb-1">Email Marketing</h1>
        <p className="text-slate-400 text-sm mb-8">
          Campaigns to real users of Revalor&apos;s own products — pulled live from each product&apos;s own user base.
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
                    <p className="text-sm text-white">{c.subject || "(no subject)"}</p>
                    <p className="text-xs text-slate-500 mt-0.5 capitalize">{c.product}</p>
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
            {loadingAudience ? "Loading audience…" : audienceCount === null ? "" : `${audienceCount} subscriber${audienceCount === 1 ? "" : "s"} (unsubscribes already excluded)`}
          </p>

          <label className="block text-xs font-medium text-slate-400 mb-1">What&apos;s this email about?</label>
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
            {generating ? "Generating…" : "Generate email"}
          </button>
        </section>

        {(subject || bodyHtml) && (
          <section className="bg-[#0d0d0d] rounded-2xl border border-green-600 p-6 mb-8">
            <label className="block text-xs font-medium text-slate-400 mb-1">Subject</label>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full bg-black border border-slate-700 rounded-lg px-3 py-2 text-sm mb-3"
            />

            <label className="block text-xs font-medium text-slate-400 mb-1">Body (HTML)</label>
            <textarea
              value={bodyHtml}
              onChange={(e) => setBodyHtml(e.target.value)}
              rows={8}
              className="w-full bg-black border border-slate-700 rounded-lg px-3 py-2 text-sm mb-4 font-mono text-xs"
            />

            {error && <div className="mb-3 p-2 rounded-lg bg-red-900/40 border border-red-700 text-red-300 text-sm">{error}</div>}
            {message && <div className="mb-3 p-2 rounded-lg bg-green-900/40 border border-green-700 text-green-300 text-sm">{message}</div>}

            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={saveDraft}
                disabled={saving || !subject.trim() || !bodyHtml.trim()}
                className="text-xs font-medium text-sky-400 hover:underline disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save draft"}
              </button>
              <button
                onClick={sendTest}
                disabled={sendingTest || !subject.trim() || !bodyHtml.trim()}
                className="text-xs font-medium text-amber-400 hover:underline disabled:opacity-50"
              >
                {sendingTest ? "Sending test…" : "Send test to myself"}
              </button>
              <button
                onClick={sendReal}
                disabled={sending || !subject.trim() || !bodyHtml.trim()}
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
                Send to specific emails instead (comma or newline separated)
              </label>
              <textarea
                value={targetedEmails}
                onChange={(e) => setTargetedEmails(e.target.value)}
                rows={2}
                placeholder="jane@example.com, sam@example.com"
                className="w-full bg-black border border-slate-700 rounded-lg px-3 py-2 text-sm mb-2"
              />
              <button
                onClick={sendTargeted}
                disabled={sendingTargeted || !targetedEmails.trim() || !subject.trim() || !bodyHtml.trim()}
                className="text-xs font-medium text-teal-400 hover:underline disabled:opacity-50"
              >
                {sendingTargeted ? "Sending…" : "Send to these emails"}
              </button>
            </div>
          </section>
        )}

        <section className="bg-[#0d0d0d] rounded-2xl border border-sky-700 p-6 mb-8">
          <h2 className="font-semibold text-white mb-1">Schedule or automate</h2>
          <p className="text-xs text-slate-500 mb-4">
            Content is generated when it&apos;s due to send, not now — so it reflects the product at send time.
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

          <label className="block text-xs font-medium text-slate-400 mb-1">Product</label>
          <select
            value={schedProduct}
            onChange={(e) => setSchedProduct(e.target.value as MarketingProduct)}
            className="w-full bg-black border border-slate-700 rounded-lg px-3 py-2 text-sm mb-3"
          >
            {PRODUCTS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>

          <label className="block text-xs font-medium text-slate-400 mb-1">What&apos;s this email about?</label>
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
            onChange={(e) => setSchedAutonomy(e.target.value as MarketingAutonomy)}
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
                    <p className="text-sm text-white">{productLabel(c.product)} — {c.goal || "(no goal set)"}</p>
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
                    <p className="text-sm text-white">{productLabel(s.product)} — {s.goal}</p>
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
                  <th className="px-2 py-2 font-medium">Subject</th>
                  <th className="px-2 py-2 font-medium">Status</th>
                  <th className="px-2 py-2 font-medium">Sent / Failed</th>
                  <th className="px-6 py-2 font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.id} className="border-b border-slate-800/50">
                    <td className="px-6 py-2.5 capitalize">{c.product}</td>
                    <td className="px-2 py-2.5 text-slate-300">{c.subject || "—"}</td>
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
