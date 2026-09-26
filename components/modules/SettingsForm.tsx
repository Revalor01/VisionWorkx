"use client";

import { useState } from "react";
import { modulesBrowserClient } from "@/lib/modules/supabase-browser";
import { normalizeDomainList } from "@/lib/modules/domains";
import type { Brand } from "@/lib/modules/config";

const TIME_ZONES = [
  "America/New_York", "America/Chicago", "America/Denver", "America/Phoenix",
  "America/Los_Angeles", "America/Anchorage", "Pacific/Honolulu",
];

export default function SettingsForm({
  workspace,
}: {
  workspace: {
    id: string; slug: string; name: string; domains: string[]; brand: Brand; logoUrl: string;
    notificationEmail: string; timeZone: string; webhookUrl: string;
  };
}) {
  const [f, setF] = useState({ ...workspace, domainsText: workspace.domains.join("\n") });
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");
  const [secret, setSecret] = useState<string | null>(null);

  function set<K extends keyof typeof f>(k: K, v: (typeof f)[K]) {
    setF((p) => ({ ...p, [k]: v }));
    setStatus("idle");
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const domains = normalizeDomainList(f.domainsText.split(/[\s,]+/));
    if (f.webhookUrl && !/^https:\/\/[^\s]+$/.test(f.webhookUrl)) return setError("The webhook URL must start with https://");
    if (f.logoUrl && !/^https:\/\/[^\s]+$/.test(f.logoUrl)) return setError("The logo URL must start with https://");
    if (!f.name.trim()) return setError("Enter your business name.");
    setStatus("saving");
    const { error } = await modulesBrowserClient()
      .from("vw_workspaces")
      .update({
        name: f.name.trim(),
        domains,
        brand: f.brand,
        logo_url: f.logoUrl.trim() || null,
        notification_email: f.notificationEmail.trim() || null,
        time_zone: f.timeZone,
        webhook_url: f.webhookUrl.trim() || null,
      })
      .eq("id", workspace.id);
    if (error) {
      setStatus("error");
      setError("Couldn't save your settings. Please try again.");
      return;
    }
    setF((p) => ({ ...p, domainsText: domains.join("\n") }));
    setStatus("saved");
  }

  async function revealSecret() {
    const res = await fetch(`/api/workspace/${workspace.slug}/webhook-secret`);
    const body = await res.json().catch(() => ({}));
    setSecret(res.ok ? body.secret : "Couldn't load the secret.");
  }

  const input = "mt-1.5 w-full rounded-xl border border-gray-300 px-3.5 py-2.5 text-sm focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy/20";
  const label = "block text-sm font-semibold text-gray-700";

  return (
    <form onSubmit={save} className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-navy-dark">Settings</h1>
        <p className="text-sm text-gray-500">Only workspace owners can change these.</p>
      </div>

      <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-6">
        <h2 className="font-bold text-gray-900">Business</h2>
        <label htmlFor="s-name" className={label}>Business name
          <input id="s-name" className={input} value={f.name} maxLength={120} onChange={(e) => set("name", e.target.value)} />
        </label>
        <label htmlFor="s-email" className={label}>Where should new-submission alerts go?
          <input id="s-email" type="email" className={input} value={f.notificationEmail} onChange={(e) => set("notificationEmail", e.target.value)} placeholder="you@yourbusiness.com" />
        </label>
        <label htmlFor="s-tz" className={label}>Time zone
          <select id="s-tz" className={input} value={f.timeZone} onChange={(e) => set("timeZone", e.target.value)}>
            {[...new Set([f.timeZone, ...TIME_ZONES])].map((tz) => <option key={tz} value={tz}>{tz.replace(/_/g, " ")}</option>)}
          </select>
        </label>
      </section>

      <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-6">
        <h2 className="font-bold text-gray-900">Your websites</h2>
        <label htmlFor="s-domains" className={label}>Websites allowed to show your modules (one per line)
          <textarea id="s-domains" rows={3} className={input} value={f.domainsText} onChange={(e) => set("domainsText", e.target.value)} placeholder={"yourbusiness.com\nwww.yourbusiness.com"} />
        </label>
        <p className="text-xs text-gray-500">List both versions (with and without www) if your site uses both. Modules won&apos;t load on any other website.</p>
      </section>

      <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-6">
        <h2 className="font-bold text-gray-900">Branding</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <label htmlFor="s-color" className={label}>Color
            <input id="s-color" type="color" className="mt-1.5 h-10 w-full rounded-xl border border-gray-300 p-1" value={f.brand.color} onChange={(e) => set("brand", { ...f.brand, color: e.target.value })} />
          </label>
          <label htmlFor="s-font" className={label}>Font
            <select id="s-font" className={input} value={f.brand.font} onChange={(e) => set("brand", { ...f.brand, font: e.target.value as Brand["font"] })}>
              <option value="modern">Modern</option><option value="classic">Classic</option><option value="friendly">Friendly</option>
            </select>
          </label>
          <label htmlFor="s-radius" className={label}>Corners
            <select id="s-radius" className={input} value={f.brand.radius} onChange={(e) => set("brand", { ...f.brand, radius: Number(e.target.value) })}>
              <option value={2}>Square</option><option value={10}>Soft</option><option value={18}>Round</option>
            </select>
          </label>
        </div>
        <label htmlFor="s-logo" className={label}>Logo URL <span className="font-normal text-gray-500">(https, square works best)</span>
          <input id="s-logo" className={input} value={f.logoUrl} onChange={(e) => set("logoUrl", e.target.value)} placeholder="https://yourbusiness.com/logo.png" />
        </label>
      </section>

      <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-6">
        <h2 className="font-bold text-gray-900">Send submissions to another tool (webhook)</h2>
        <label htmlFor="s-hook" className={label}>Webhook URL
          <input id="s-hook" className={input} value={f.webhookUrl} onChange={(e) => set("webhookUrl", e.target.value)} placeholder="https://hooks.zapier.com/…" />
        </label>
        <p className="text-xs text-gray-500">
          Every new submission is POSTed here as JSON, signed with the header <code>X-VisionWorkx-Signature</code> (HMAC-SHA256 of
          <code> timestamp.body</code>).
        </p>
        <div className="text-sm">
          {secret ? (
            <code className="break-all rounded bg-gray-100 px-2 py-1">{secret}</code>
          ) : (
            <button type="button" onClick={revealSecret} className="font-semibold text-navy hover:underline">Show signing secret</button>
          )}
        </div>
      </section>

      <div className="flex items-center gap-4">
        <button type="submit" disabled={status === "saving"} className="rounded-xl bg-navy-dark px-6 py-3 font-semibold text-white hover:bg-navy disabled:opacity-60">
          {status === "saving" ? "Saving…" : "Save settings"}
        </button>
        {status === "saved" && <span role="status" className="text-sm text-emerald-700">Saved</span>}
        {error && <span role="alert" className="text-sm text-red-600">{error}</span>}
      </div>
    </form>
  );
}
