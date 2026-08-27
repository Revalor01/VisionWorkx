"use client";

import { useEffect, useState } from "react";
import type { MarketingCampaign, MarketingProduct } from "@/lib/database.types";
import { MARKETING_PRODUCTS } from "@/lib/marketing/products";
import { PUSH_TITLE_MAX, PUSH_BODY_MAX, SMS_BODY_MAX } from "@/lib/mobile/limits";

type MobileChannel = "push" | "sms";

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

function CharCount({ value, max }: { value: string; max: number }) {
  const over = value.length > max;
  return <span className={over ? "text-red-400" : "text-slate-500"}>{value.length}/{max}</span>;
}

export default function MobileDashboard({ initialCampaigns }: { initialCampaigns: MarketingCampaign[] }) {
  const [campaigns, setCampaigns] = useState(initialCampaigns);
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

  useEffect(() => {
    loadAudience(product, channel);
    setConfirmSend(false);
  }, [product, channel]);

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

  const bodyMax = channel === "push" ? PUSH_BODY_MAX : SMS_BODY_MAX;
  const hasDraft = channel === "push" ? title || bodyText : !!bodyText;

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
          Push and SMS to real users of Revalor&apos;s own products — opted-in only. No product currently captures push
          tokens or SMS consent (see the audience count below), so real sends have nobody to reach yet; this is the
          plumbing ready for when one does.
        </p>

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
