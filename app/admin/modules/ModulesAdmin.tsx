"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { embedSnippet } from "@/lib/modules/install";

export interface AdminWorkspace {
  id: string; name: string; slug: string; domains: string[]; plan: string; created_at: string;
  modules: { id: string; public_id: string; type: string; name: string; status: string }[];
  memberCount: number; submissions30d: number;
}

async function call(body: Record<string, unknown>) {
  const res = await fetch("/api/admin/modules", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

const input = "rounded-lg border border-gray-300 px-3 py-2 text-sm";

export default function ModulesAdmin({ initial }: { initial: AdminWorkspace[] }) {
  const router = useRouter();
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(body: Record<string, unknown>, ok: string) {
    setBusy(true);
    setMsg("");
    try {
      await call(body);
      setMsg(ok);
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-5xl space-y-8 p-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">Operator</p>
        <h1 className="text-2xl font-bold text-navy-dark">VisionWorkx modules — client workspaces</h1>
      </div>
      {msg && <p role="status" className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800">{msg}</p>}

      <form
        className="grid gap-3 rounded-2xl border border-gray-200 bg-white p-5 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          run(
            { action: "create_workspace", name: f.get("name"), slug: f.get("slug"), notification_email: f.get("email"), domains: String(f.get("domains") ?? "").split(/[\s,]+/) },
            "Workspace created.",
          );
        }}
      >
        <h2 className="font-bold sm:col-span-2">New client workspace</h2>
        <label className="text-sm font-medium">Business name<input name="name" required className={`${input} mt-1 w-full`} /></label>
        <label className="text-sm font-medium">Slug (URL)<input name="slug" required pattern="[a-z0-9][a-z0-9-]{1,46}[a-z0-9]" className={`${input} mt-1 w-full`} placeholder="harbor-plumbing" /></label>
        <label className="text-sm font-medium">Alert email<input name="email" type="email" className={`${input} mt-1 w-full`} /></label>
        <label className="text-sm font-medium">Website domains<input name="domains" className={`${input} mt-1 w-full`} placeholder="example.com www.example.com" /></label>
        <button disabled={busy} className="rounded-lg bg-navy-dark px-4 py-2 text-sm font-semibold text-white sm:col-span-2 sm:justify-self-start">Create workspace</button>
      </form>

      {initial.map((w) => (
        <section key={w.id} className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-bold">{w.name} <span className="text-sm font-normal text-gray-500">/{w.slug} · {w.plan}</span></h2>
            <span className="text-sm text-gray-500">{w.memberCount} logins · {w.submissions30d} submissions (30d)</span>
          </div>
          <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); run({ action: "update_domains", workspace_id: w.id, domains: String(f.get("domains") ?? "").split(/[\s,]+/) }, "Domains saved."); }}>
            <input name="domains" defaultValue={w.domains.join(" ")} className={`${input} min-w-0 flex-1`} aria-label="Domains" />
            <button disabled={busy} className="rounded-lg border px-3 py-2 text-sm">Save domains</button>
          </form>
          <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); run({ action: "invite_member", workspace_id: w.id, email: f.get("email"), role: f.get("role") }, "Invite sent."); }}>
            <input name="email" type="email" required placeholder="owner@client.com" className={`${input} min-w-0 flex-1`} aria-label="Invite email" />
            <select name="role" className={input} aria-label="Role"><option value="owner">Owner</option><option value="staff">Staff</option></select>
            <button disabled={busy} className="rounded-lg border px-3 py-2 text-sm">Invite login</button>
          </form>
          <div className="space-y-2">
            {w.modules.map((m) => (
              <div key={m.id} className="rounded-xl border border-gray-100 p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span><strong>{m.name}</strong> · {m.type} · <em>{m.status}</em></span>
                  <select defaultValue={m.status} disabled={busy} aria-label="Module status" className={input}
                    onChange={(e) => run({ action: "set_module_status", public_id: m.public_id, status: e.target.value }, "Status updated.")}>
                    <option value="draft">draft</option><option value="live">live</option><option value="paused">paused</option>
                  </select>
                </div>
                <code className="mt-2 block break-all rounded bg-gray-50 p-2 text-xs">{embedSnippet(m.public_id)}</code>
              </div>
            ))}
            <button disabled={busy} className="rounded-lg border px-3 py-2 text-sm" onClick={() => run({ action: "create_module", workspace_id: w.id, type: "lead_capture", name: "Lead capture form" }, "Module created (draft).")}>
              + Add lead capture module
            </button>
          </div>
        </section>
      ))}
    </main>
  );
}
