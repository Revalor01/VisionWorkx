"use client";

import { useEffect, useState } from "react";
import type { MarketingAutonomy, MarketingCampaign, MarketingProduct, MarketingRecurrence, MarketingRecurringSchedule } from "@/lib/database.types";
import { MARKETING_PRODUCTS } from "@/lib/marketing/products";
import { SMS_BODY_MAX } from "@/lib/mobile/limits";
import { parsePhoneList } from "@/lib/mobile/phone";
import AdminNavBar from "../AdminNavBar";

const PRODUCTS: { value: MarketingProduct; label: string }[] = MARKETING_PRODUCTS.map((p) => ({
  value: p.slug,
  label: p.name,
}));

const STATUS_STYLE: Record<MarketingCampaign["status"], string> = {
  draft: "bg-zinc-100 text-zinc-700",
  scheduled: "bg-sky-100 text-sky-800",
  generated: "bg-zinc-100 text-zinc-700",
  pending_review: "bg-amber-100 text-amber-800",
  sending: "bg-amber-100 text-amber-800",
  sent: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
  canceled: "bg-zinc-100 text-zinc-500",
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

  // "Text a number" — sends one SMS straight to phone numbers typed in here.
  // Reuses the mobile campaign endpoints (which already own Twilio, the
  // opt-out list and the campaign log), so nothing here talks to Twilio.
  const [smsProduct, setSmsProduct] = useState<MarketingProduct>("visionworkx");
  const [smsNumbers, setSmsNumbers] = useState("");
  const [smsBody, setSmsBody] = useState("");
  const [confirmSms, setConfirmSms] = useState(false);
  const [sendingSms, setSendingSms] = useState(false);
  const [smsError, setSmsError] = useState("");
  const [smsMessage, setSmsMessage] = useState("");

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

  const smsPhones = parsePhoneList(smsNumbers);
  const smsTooLong = smsBody.length > SMS_BODY_MAX;
  const OPT_OUT_LINE = "Reply STOP to opt out.";

  async function sendSmsToNumbers() {
    if (smsPhones.valid.length === 0 || !smsBody.trim() || smsTooLong) return;
    if (!confirmSms) {
      setConfirmSms(true);
      return;
    }
    setSendingSms(true);
    setSmsError("");
    setSmsMessage("");
    try {
      const created = await fetch("/api/admin/mobile/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product: smsProduct, channel: "sms", bodyText: smsBody }),
      });
      const createdBody = await created.json();
      if (!created.ok) throw new Error(createdBody.error ?? `HTTP ${created.status}`);

      const res = await fetch(`/api/admin/mobile/campaigns/${createdBody.campaign.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targets: smsPhones.valid }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setSmsMessage(
        `Texted ${body.sent} of ${body.recipientCount} number${body.recipientCount === 1 ? "" : "s"}${body.failed ? ` (${body.failed} failed)` : ""}${body.skipped ? ` — ${body.skipped} skipped (opted out or not a valid number)` : ""}.`
      );
      setConfirmSms(false);
    } catch (err) {
      setSmsError((err as Error).message);
    } finally {
      setSendingSms(false);
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
    <div className="min-h-screen bg-white text-zinc-900">
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
        <AdminNavBar category="media" current="marketing" />

        <h1 className="text-2xl font-bold text-zinc-900 mb-1">Email Marketing</h1>
        <p className="text-zinc-600 text-sm mb-8">
          Campaigns to real users of Revalor&apos;s own products — pulled live from each product&apos;s own user base.
        </p>

        {pendingReview.length > 0 && (
          <section className="bg-white rounded-2xl border border-amber-400 shadow-sm overflow-hidden mb-8">
            <div className="px-6 py-4 border-b border-zinc-200">
              <h2 className="font-semibold text-zinc-900">Pending review ({pendingReview.length})</h2>
              <p className="text-xs text-zinc-500 mt-1">Autonomy is manual — these generated but need your approval before they send.</p>
            </div>
            <div className="divide-y divide-zinc-200">
              {pendingReview.map((c) => (
                <div key={c.id} className="px-6 py-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm text-zinc-900">{c.subject || "(no subject)"}</p>
                    <p className="text-xs text-zinc-500 mt-0.5 capitalize">{c.product}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <button
                      onClick={withBusy(c.id, () => approveCampaign(c.id))}
                      disabled={busyIds.has(c.id)}
                      className="text-xs font-medium text-green-700 hover:underline disabled:opacity-50"
                    >
                      {busyIds.has(c.id) ? "Working…" : "Approve & send"}
                    </button>
                    <button
                      onClick={withBusy(c.id, () => cancelCampaign(c.id))}
                      disabled={busyIds.has(c.id)}
                      className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-6 mb-8">
          <label className="block text-xs font-medium text-zinc-600 mb-1">Product</label>
          <select
            value={product}
            onChange={(e) => setProduct(e.target.value as MarketingProduct)}
            className="w-full bg-white border border-zinc-300 text-zinc-900 rounded-lg px-3 py-2 text-sm mb-2"
          >
            {PRODUCTS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-zinc-500 mb-4">
            {loadingAudience ? "Loading audience…" : audienceCount === null ? "" : `${audienceCount} subscriber${audienceCount === 1 ? "" : "s"} (unsubscribes already excluded)`}
          </p>

          <label className="block text-xs font-medium text-zinc-600 mb-1">What&apos;s this email about?</label>
          <input
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="e.g. announcing the new weekly recap feature"
            className="w-full bg-white border border-zinc-300 text-zinc-900 rounded-lg px-3 py-2 text-sm mb-3"
          />

          <label className="block text-xs font-medium text-zinc-600 mb-1">Brand voice notes (optional)</label>
          <input
            value={voiceNotes}
            onChange={(e) => setVoiceNotes(e.target.value)}
            className="w-full bg-white border border-zinc-300 text-zinc-900 rounded-lg px-3 py-2 text-sm mb-4"
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
          <section className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-6 mb-8">
            <label className="block text-xs font-medium text-zinc-600 mb-1">Subject</label>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full bg-white border border-zinc-300 text-zinc-900 rounded-lg px-3 py-2 text-sm mb-3"
            />

            <label className="block text-xs font-medium text-zinc-600 mb-1">Body (HTML)</label>
            <textarea
              value={bodyHtml}
              onChange={(e) => setBodyHtml(e.target.value)}
              rows={8}
              className="w-full bg-white border border-zinc-300 text-zinc-900 rounded-lg px-3 py-2 text-sm mb-4 font-mono text-xs"
            />

            {error && <div className="mb-3 p-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}
            {message && <div className="mb-3 p-2 rounded-lg bg-green-50 border border-green-200 text-green-800 text-sm">{message}</div>}

            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={saveDraft}
                disabled={saving || !subject.trim() || !bodyHtml.trim()}
                className="text-xs font-medium text-sky-700 hover:underline disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save draft"}
              </button>
              <button
                onClick={sendTest}
                disabled={sendingTest || !subject.trim() || !bodyHtml.trim()}
                className="text-xs font-medium text-amber-700 hover:underline disabled:opacity-50"
              >
                {sendingTest ? "Sending test…" : "Send test to myself"}
              </button>
              <button
                onClick={sendReal}
                disabled={sending || !subject.trim() || !bodyHtml.trim()}
                className={`text-xs font-medium hover:underline disabled:opacity-50 ${confirmSend ? "text-red-600" : "text-purple-700"}`}
              >
                {sending
                  ? "Sending…"
                  : confirmSend
                    ? `Confirm — send to all ${audienceCount ?? "?"} recipients`
                    : `Send to ${audienceCount ?? "?"} recipients`}
              </button>
              {confirmSend && (
                <button onClick={() => setConfirmSend(false)} className="text-xs font-medium text-zinc-600 hover:underline">
                  Cancel
                </button>
              )}
            </div>

            <div className="mt-4 pt-4 border-t border-zinc-200">
              <label className="block text-xs font-medium text-zinc-600 mb-1">
                Send to specific emails instead (comma or newline separated)
              </label>
              <textarea
                value={targetedEmails}
                onChange={(e) => setTargetedEmails(e.target.value)}
                rows={2}
                placeholder="jane@example.com, sam@example.com"
                className="w-full bg-white border border-zinc-300 text-zinc-900 rounded-lg px-3 py-2 text-sm mb-2"
              />
              <button
                onClick={sendTargeted}
                disabled={sendingTargeted || !targetedEmails.trim() || !subject.trim() || !bodyHtml.trim()}
                className="text-xs font-medium text-teal-700 hover:underline disabled:opacity-50"
              >
                {sendingTargeted ? "Sending…" : "Send to these emails"}
              </button>
            </div>
          </section>
        )}

        <section className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-6 mb-8">
          <h2 className="font-semibold text-zinc-900 mb-1">Text a phone number</h2>
          <p className="text-xs text-zinc-500 mb-4">
            Send a text message straight to a number you type in. Numbers that have replied STOP are skipped automatically.
          </p>

          <label htmlFor="sms-product" className="block text-xs font-medium text-zinc-600 mb-1">Product</label>
          <select
            id="sms-product"
            value={smsProduct}
            onChange={(e) => setSmsProduct(e.target.value as MarketingProduct)}
            className="w-full bg-white border border-zinc-300 text-zinc-900 rounded-lg px-3 py-2 text-sm mb-3"
          >
            {PRODUCTS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>

          <label htmlFor="sms-numbers" className="block text-xs font-medium text-zinc-600 mb-1">
            Phone number(s) — comma or newline separated
          </label>
          <textarea
            id="sms-numbers"
            value={smsNumbers}
            onChange={(e) => {
              setSmsNumbers(e.target.value);
              setConfirmSms(false);
            }}
            rows={2}
            inputMode="tel"
            placeholder="(555) 234-5678, +1 555 987 6543"
            className="w-full bg-white border border-zinc-300 text-zinc-900 rounded-lg px-3 py-2 text-sm mb-1"
          />
          <p className={`text-xs mb-3 ${smsPhones.invalid.length > 0 ? "text-red-600" : "text-zinc-500"}`}>
            {smsNumbers.trim() === ""
              ? "US numbers don't need a country code; use +44… etc. for others."
              : `${smsPhones.valid.length} number${smsPhones.valid.length === 1 ? "" : "s"} ready${
                  smsPhones.invalid.length > 0 ? ` · can't read: ${smsPhones.invalid.join(", ")}` : ""
                }`}
          </p>

          <label htmlFor="sms-body" className="block text-xs font-medium text-zinc-600 mb-1">Message</label>
          <textarea
            id="sms-body"
            value={smsBody}
            onChange={(e) => {
              setSmsBody(e.target.value);
              setConfirmSms(false);
            }}
            rows={3}
            className="w-full bg-white border border-zinc-300 text-zinc-900 rounded-lg px-3 py-2 text-sm mb-1"
          />
          <div className="flex items-center justify-between mb-4">
            <span className={`text-xs ${smsTooLong ? "text-red-600" : "text-zinc-500"}`}>
              {smsBody.length}/{SMS_BODY_MAX} characters
            </span>
            {!smsBody.includes("STOP") && smsBody.length + OPT_OUT_LINE.length + 1 <= SMS_BODY_MAX && smsBody.trim() !== "" && (
              <button
                type="button"
                onClick={() => setSmsBody((b) => `${b.trimEnd()} ${OPT_OUT_LINE}`)}
                className="text-xs font-medium text-sky-700 hover:underline"
              >
                Add &ldquo;{OPT_OUT_LINE}&rdquo;
              </button>
            )}
          </div>

          {smsError && <div className="mb-3 p-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{smsError}</div>}
          {smsMessage && <div className="mb-3 p-2 rounded-lg bg-green-50 border border-green-200 text-green-800 text-sm">{smsMessage}</div>}

          <div className="flex items-center gap-3">
            <button
              onClick={sendSmsToNumbers}
              disabled={sendingSms || smsPhones.valid.length === 0 || !smsBody.trim() || smsTooLong}
              className={`px-4 py-2 rounded-lg text-white text-sm font-medium transition-colors disabled:opacity-50 ${confirmSms ? "bg-red-600 hover:bg-red-700" : "bg-[#1A3A5C] hover:bg-[#15304a]"}`}
            >
              {sendingSms
                ? "Sending…"
                : confirmSms
                  ? `Confirm — text ${smsPhones.valid.length} number${smsPhones.valid.length === 1 ? "" : "s"}`
                  : "Send text"}
            </button>
            {confirmSms && (
              <button onClick={() => setConfirmSms(false)} className="text-xs font-medium text-zinc-600 hover:underline">
                Cancel
              </button>
            )}
          </div>
        </section>

        <section className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-6 mb-8">
          <h2 className="font-semibold text-zinc-900 mb-1">Schedule or automate</h2>
          <p className="text-xs text-zinc-500 mb-4">
            Content is generated when it&apos;s due to send, not now — so it reflects the product at send time.
          </p>

          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setSchedMode("once")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium ${schedMode === "once" ? "bg-sky-700 text-white" : "bg-white border border-zinc-300 text-zinc-600"}`}
            >
              One-off
            </button>
            <button
              onClick={() => setSchedMode("recurring")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium ${schedMode === "recurring" ? "bg-sky-700 text-white" : "bg-white border border-zinc-300 text-zinc-600"}`}
            >
              Recurring
            </button>
          </div>

          <label className="block text-xs font-medium text-zinc-600 mb-1">Product</label>
          <select
            value={schedProduct}
            onChange={(e) => setSchedProduct(e.target.value as MarketingProduct)}
            className="w-full bg-white border border-zinc-300 text-zinc-900 rounded-lg px-3 py-2 text-sm mb-3"
          >
            {PRODUCTS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>

          <label className="block text-xs font-medium text-zinc-600 mb-1">What&apos;s this email about?</label>
          <input
            value={schedGoal}
            onChange={(e) => setSchedGoal(e.target.value)}
            placeholder={schedMode === "recurring" ? "e.g. weekly product digest (leave brief — recent activity fills the rest)" : "e.g. announcing the new weekly recap feature"}
            className="w-full bg-white border border-zinc-300 text-zinc-900 rounded-lg px-3 py-2 text-sm mb-3"
          />

          <label className="block text-xs font-medium text-zinc-600 mb-1">Brand voice notes (optional)</label>
          <input
            value={schedVoiceNotes}
            onChange={(e) => setSchedVoiceNotes(e.target.value)}
            className="w-full bg-white border border-zinc-300 text-zinc-900 rounded-lg px-3 py-2 text-sm mb-3"
          />

          {schedMode === "once" ? (
            <>
              <label className="block text-xs font-medium text-zinc-600 mb-1">Send at</label>
              <input
                type="datetime-local"
                value={schedRunAt}
                onChange={(e) => setSchedRunAt(e.target.value)}
                className="w-full bg-white border border-zinc-300 text-zinc-900 rounded-lg px-3 py-2 text-sm mb-3"
              />
            </>
          ) : (
            <div className="flex gap-3 mb-3 flex-wrap">
              <select
                value={schedRecurrence}
                onChange={(e) => setSchedRecurrence(e.target.value as MarketingRecurrence)}
                className="bg-white border border-zinc-300 text-zinc-900 rounded-lg px-3 py-2 text-sm"
              >
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
              {schedRecurrence === "weekly" ? (
                <select
                  value={schedDayOfWeek}
                  onChange={(e) => setSchedDayOfWeek(Number(e.target.value))}
                  className="bg-white border border-zinc-300 text-zinc-900 rounded-lg px-3 py-2 text-sm"
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
                  className="bg-white border border-zinc-300 text-zinc-900 rounded-lg px-3 py-2 text-sm w-24"
                  placeholder="Day (1-31)"
                />
              )}
              <select
                value={schedHourUtc}
                onChange={(e) => setSchedHourUtc(Number(e.target.value))}
                className="bg-white border border-zinc-300 text-zinc-900 rounded-lg px-3 py-2 text-sm"
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, "0")}:00 UTC
                  </option>
                ))}
              </select>
            </div>
          )}

          <label className="block text-xs font-medium text-zinc-600 mb-1">Autonomy</label>
          <select
            value={schedAutonomy}
            onChange={(e) => setSchedAutonomy(e.target.value as MarketingAutonomy)}
            className="w-full bg-white border border-zinc-300 text-zinc-900 rounded-lg px-3 py-2 text-sm mb-4"
          >
            <option value="manual">Manual — hold the generated draft for review</option>
            <option value="auto">Auto — send without review</option>
          </select>

          {schedError && <div className="mb-3 p-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{schedError}</div>}
          {schedMessage && <div className="mb-3 p-2 rounded-lg bg-green-50 border border-green-200 text-green-800 text-sm">{schedMessage}</div>}

          <button
            onClick={createSchedule}
            disabled={scheduling || !schedGoal.trim() || (schedMode === "once" && !schedRunAt)}
            className="px-4 py-2 rounded-lg bg-sky-700 text-white text-sm font-medium hover:bg-sky-800 transition-colors disabled:opacity-50"
          >
            {scheduling ? "Saving…" : schedMode === "once" ? "Schedule send" : "Create recurring digest"}
          </button>
        </section>

        {(upcomingOneOff.length > 0 || activeSchedules.length > 0) && (
          <section className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden mb-8">
            <div className="px-6 py-4 border-b border-zinc-200">
              <h2 className="font-semibold text-zinc-900">Scheduled &amp; recurring</h2>
            </div>
            <div className="divide-y divide-zinc-200">
              {upcomingOneOff.map((c) => (
                <div key={c.id} className="px-6 py-3 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm text-zinc-900">{productLabel(c.product)} — {c.goal || "(no goal set)"}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      One-off · {c.run_at ? new Date(c.run_at).toLocaleString() : "—"} · autonomy: {c.autonomy}
                    </p>
                  </div>
                  <button
                    onClick={withBusy(c.id, () => cancelCampaign(c.id))}
                    disabled={busyIds.has(c.id)}
                    className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50 shrink-0"
                  >
                    Cancel
                  </button>
                </div>
              ))}
              {activeSchedules.map((s) => (
                <div key={s.id} className="px-6 py-3 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm text-zinc-900">{productLabel(s.product)} — {s.goal}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {s.recurrence === "weekly" ? WEEKDAY_LABELS[s.day_of_week ?? 0] : `Day ${s.day_of_month} of month`} at{" "}
                      {String(s.hour_utc).padStart(2, "0")}:00 UTC · next {new Date(s.next_run_at).toLocaleString()} · autonomy: {s.autonomy}
                    </p>
                  </div>
                  <button
                    onClick={withBusy(s.id, () => cancelSchedule(s.id))}
                    disabled={busyIds.has(s.id)}
                    className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50 shrink-0"
                  >
                    Cancel
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-zinc-200">
            <h2 className="font-semibold text-zinc-900">Campaign history</h2>
          </div>
          {campaigns.length === 0 ? (
            <p className="text-sm text-zinc-500 p-6">No campaigns yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-zinc-500 border-b border-zinc-200">
                  <th className="px-6 py-2 font-medium">Product</th>
                  <th className="px-2 py-2 font-medium">Subject</th>
                  <th className="px-2 py-2 font-medium">Status</th>
                  <th className="px-2 py-2 font-medium">Sent / Failed</th>
                  <th className="px-6 py-2 font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.id} className="border-b border-zinc-100">
                    <td className="px-6 py-2.5 capitalize">{c.product}</td>
                    <td className="px-2 py-2.5 text-zinc-700">{c.subject || "—"}</td>
                    <td className="px-2 py-2.5">
                      <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${STATUS_STYLE[c.status]}`}>
                        {c.status}
                      </span>
                    </td>
                    <td className="px-2 py-2.5 text-zinc-600">
                      {c.sent_count} / {c.failed_count}
                    </td>
                    <td className="px-6 py-2.5 text-zinc-500">{new Date(c.created_at).toLocaleDateString()}</td>
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
