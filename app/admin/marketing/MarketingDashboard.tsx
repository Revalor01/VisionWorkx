"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { MarketingCampaign, MarketingProduct } from "@/lib/database.types";

const PRODUCTS: { value: MarketingProduct; label: string }[] = [
  { value: "visionworkx", label: "VisionWorkx" },
  { value: "chorebit", label: "Chorebit" },
  { value: "feelflow", label: "FeelFlow" },
  { value: "mindbit", label: "MindBit" },
];

const STATUS_STYLE: Record<MarketingCampaign["status"], string> = {
  draft: "bg-slate-700 text-slate-200",
  sending: "bg-amber-900/60 text-amber-300",
  sent: "bg-green-900/60 text-green-300",
  failed: "bg-red-900/60 text-red-300",
};

export default function MarketingDashboard({ initialCampaigns }: { initialCampaigns: MarketingCampaign[] }) {
  const [campaigns, setCampaigns] = useState(initialCampaigns);
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
      const listRes = await fetch("/api/admin/marketing/campaigns");
      const listBody = await listRes.json();
      if (listRes.ok) setCampaigns(listBody.campaigns);
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

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="bg-[#1A3A5C] text-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold tracking-tight">Revalor</span>
          <span className="text-xs bg-black/20 px-2 py-0.5 rounded-full font-medium">Email Marketing</span>
        </div>
        <Link href="/admin" className="text-xs text-white/70 hover:text-white transition-colors">
          ← Back to Admin
        </Link>
      </header>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <h1 className="text-2xl font-bold text-white mb-1">Email Marketing</h1>
        <p className="text-slate-400 text-sm mb-8">
          Campaigns to real users of Revalor&apos;s own products — pulled live from each product&apos;s own user base.
        </p>

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
                    <td className="px-2 py-2.5 text-slate-300">{c.subject}</td>
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
