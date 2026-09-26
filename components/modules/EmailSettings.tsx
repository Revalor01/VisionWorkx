"use client";

import { useState } from "react";
import { EMAIL_KINDS, EMAIL_KIND_LABEL, EMAIL_VARIABLES, type EmailKind } from "@/lib/modules/emailDefaults";

type T = { subject: string; body: string; enabled: boolean; delayHours: number };

export default function EmailSettings({ slug, initial }: { slug: string; initial: Record<string, T> }) {
  const [tpl, setTpl] = useState<Record<string, T>>(initial);
  const [open, setOpen] = useState<EmailKind | null>(null);
  const [status, setStatus] = useState<Record<string, string>>({});

  const set = (k: EmailKind, patch: Partial<T>) => setTpl((p) => ({ ...p, [k]: { ...p[k], ...patch } }));
  async function save(k: EmailKind) {
    setStatus((s) => ({ ...s, [k]: "Saving…" }));
    const res = await fetch(`/api/workspace/${slug}/templates`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: k, ...tpl[k] }),
    });
    const body = await res.json().catch(() => ({}));
    setStatus((s) => ({ ...s, [k]: res.ok ? "Saved" : body.error || "Couldn't save" }));
  }

  const input = "mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy/20";
  return (
    <section className="rounded-2xl border border-gray-200 bg-white" aria-labelledby="tpl-h">
      <h2 id="tpl-h" className="border-b border-gray-100 px-5 py-4 font-bold text-gray-900">Your emails</h2>
      <ul className="divide-y divide-gray-100">
        {EMAIL_KINDS.map((k) => (
          <li key={k} className="px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-gray-900">{EMAIL_KIND_LABEL[k].title}</p>
                <p className="text-xs text-gray-500">{EMAIL_KIND_LABEL[k].help}</p>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm text-gray-700" htmlFor={`en-${k}`}>
                  <input id={`en-${k}`} type="checkbox" checked={tpl[k].enabled} onChange={(e) => set(k, { enabled: e.target.checked })} />
                  On
                </label>
                <button type="button" onClick={() => setOpen(open === k ? null : k)} aria-expanded={open === k} className="text-sm font-semibold text-navy hover:underline">
                  {open === k ? "Close" : "Edit"}
                </button>
              </div>
            </div>
            {open === k && (
              <div className="mt-4 space-y-3">
                {k === "follow_up" && (
                  <label className="block text-sm font-semibold text-gray-700" htmlFor={`dl-${k}`}>Send it this many hours after the submission
                    <input id={`dl-${k}`} type="number" min={1} max={2160} className={`${input} max-w-[140px]`} value={tpl[k].delayHours} onChange={(e) => set(k, { delayHours: Number(e.target.value) })} />
                  </label>
                )}
                <label className="block text-sm font-semibold text-gray-700" htmlFor={`sj-${k}`}>Subject
                  <input id={`sj-${k}`} className={input} maxLength={200} value={tpl[k].subject} onChange={(e) => set(k, { subject: e.target.value })} />
                </label>
                <label className="block text-sm font-semibold text-gray-700" htmlFor={`bd-${k}`}>Message
                  <textarea id={`bd-${k}`} rows={7} className={`${input} font-mono`} maxLength={5000} value={tpl[k].body} onChange={(e) => set(k, { body: e.target.value })} />
                </label>
                <p className="text-xs text-gray-500">
                  You can use: {EMAIL_VARIABLES.map((v) => <code key={v} className="mr-1 rounded bg-gray-100 px-1">{`{{${v}}}`}</code>)}
                </p>
              </div>
            )}
            <div className="mt-3 flex items-center gap-3">
              <button type="button" onClick={() => save(k)} className="rounded-lg bg-navy-dark px-3 py-1.5 text-sm font-semibold text-white hover:bg-navy">Save</button>
              <span role="status" aria-live="polite" className="text-sm text-gray-600">{status[k] ?? ""}</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
