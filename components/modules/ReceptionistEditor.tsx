"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ChatWidget, { type SendFn } from "@/components/modules/ChatWidget";
import { resolveBrand, type Brand } from "@/lib/modules/config";
import {
  defaultReceptionistConfig,
  parseReceptionistConfig,
  RECEPTIONIST_TONES,
  type FaqItem,
  type ReceptionistConfig,
  type ReceptionistSetup,
} from "@/lib/receptionist/config";

// Owner setup for the AI receptionist: describe the business in plain English,
// get a draft, check every fact, test a conversation, then publish. The AI only
// ever answers from what's on this page.

const EXAMPLE =
  "We're a family-run plumbing company in Austin, TX. Open Mon–Fri 7am–6pm, Saturday 8am–noon. Drain cleaning from $129, water heater installs from $1,200, free estimates for remodels. Emergency calls after hours are $199 call-out. We serve Austin, Round Rock and Cedar Park. Licensed and insured.";

type Step = "describe" | "edit";

export default function ReceptionistEditor(props: {
  slug: string;
  businessName: string;
  logoUrl: string | null;
  workspaceBrand: Brand;
  hasDomains: boolean;
  bookingModules: { publicId: string; name: string; status: string }[];
  existing?: { publicId: string; name: string; status: string; config: ReceptionistConfig };
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(props.existing ? "edit" : "describe");
  const [description, setDescription] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [note, setNote] = useState("");
  const [name, setName] = useState(props.existing?.name ?? "AI receptionist");
  const [config, setConfig] = useState<ReceptionistConfig>(props.existing?.config ?? defaultReceptionistConfig());
  const [publicId, setPublicId] = useState(props.existing?.publicId ?? null);
  const [status, setStatus] = useState(props.existing?.status ?? "draft");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [testKey, setTestKey] = useState(0);

  const r = config.receptionist;
  const setR = (patch: Partial<ReceptionistSetup>) => {
    setConfig((c) => ({ ...c, receptionist: { ...c.receptionist, ...patch } }));
    setMsg(null);
  };
  const setFaq = (i: number, patch: Partial<FaqItem>) => setR({ faq: r.faq.map((f, j) => (j === i ? { ...f, ...patch } : f)) });

  async function draft() {
    setDrafting(true);
    setNote("");
    setMsg(null);
    try {
      const res = await fetch(`/api/workspace/${props.slug}/modules/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description, kind: "receptionist" }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Couldn't draft the receptionist.");
      setConfig(parseReceptionistConfig(body.config));
      setNote(body.note ?? "");
      setStep("edit");
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Couldn't draft the receptionist." });
    } finally {
      setDrafting(false);
    }
  }

  async function save(nextStatus?: "live" | "paused") {
    setSaving(true);
    setMsg(null);
    const clean = parseReceptionistConfig(config);
    try {
      let id = publicId;
      if (!id) {
        const res = await fetch(`/api/workspace/${props.slug}/modules`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, config: clean, type: "receptionist" }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || "Couldn't save.");
        id = body.publicId as string;
        setPublicId(id);
      }
      const res = await fetch(`/api/workspace/${props.slug}/modules/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, config: clean, ...(nextStatus ? { status: nextStatus } : {}) }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Couldn't save.");
      setStatus(body.status);
      setConfig(clean);
      setMsg({
        kind: "ok",
        text:
          nextStatus === "live"
            ? "Published — your receptionist is live. Copy its snippet on the Modules & install page."
            : nextStatus === "paused"
              ? "Paused — the chat button is hidden on your site until you publish it again."
              : "Saved.",
      });
      router.refresh();
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Couldn't save." });
    } finally {
      setSaving(false);
    }
  }

  const testSend: SendFn = async (message, history) => {
    const res = await fetch(`/api/workspace/${props.slug}/receptionist/test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config, history: history.map((m) => ({ role: m.role, content: m.content })), message }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || "The test didn't work — try again.");
    return { reply: body.reply, note: body.note };
  };

  const input = "mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy/20";
  const label = "block text-sm font-semibold text-gray-700";
  const hint = "font-normal text-gray-500";

  if (step === "describe") {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-navy-dark">New AI receptionist</h1>
          <p className="text-sm text-gray-500">
            A chat assistant on your website that answers questions, books appointments and takes messages — 24/7. Describe your business and we&apos;ll
            draft what it knows. You check every word before it goes live.
          </p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-6">
          <label htmlFor="re-desc" className={label}>
            About your business <span className={hint}>(services, prices, hours, area, anything customers ask)</span>
          </label>
          <textarea id="re-desc" rows={7} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={EXAMPLE} className={input} />
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={draft}
              disabled={drafting || description.trim().length < 8}
              className="rounded-xl bg-navy-dark px-5 py-2.5 font-semibold text-white hover:bg-navy disabled:opacity-50"
            >
              {drafting ? "Drafting your receptionist…" : "Draft my receptionist"}
            </button>
            <button type="button" onClick={() => setDescription(EXAMPLE)} className="text-sm text-gray-600 hover:underline">
              Use the example
            </button>
            <button type="button" onClick={() => setStep("edit")} className="text-sm font-semibold text-navy hover:underline">
              Or fill it in yourself
            </button>
          </div>
          <p role="status" aria-live="polite" className="mt-3 text-sm text-red-600">
            {msg?.kind === "err" ? msg.text : ""}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-navy-dark">{props.existing ? "Edit AI receptionist" : "Your draft receptionist"}</h1>
          <p className="text-sm text-gray-500">
            Status: <strong>{status}</strong>
            {note && <span className="ml-2 text-amber-700">{note}</span>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => save()} disabled={saving} className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-60">
            {saving ? "Saving…" : "Save"}
          </button>
          {status === "live" ? (
            <button type="button" onClick={() => save("paused")} disabled={saving} className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800 disabled:opacity-60">
              Pause
            </button>
          ) : (
            <button
              type="button"
              onClick={() => save("live")}
              disabled={saving || !props.hasDomains}
              title={props.hasDomains ? "" : "Add your website in Settings first"}
              className="rounded-xl bg-navy-dark px-4 py-2 text-sm font-semibold text-white hover:bg-navy disabled:opacity-50"
            >
              Save &amp; publish
            </button>
          )}
        </div>
      </div>
      <p role="status" aria-live="polite" className={`text-sm ${msg?.kind === "err" ? "text-red-600" : "text-emerald-700"}`}>
        {msg?.text ?? ""}
        {!props.hasDomains && !msg && <span className="text-amber-700">Add your website in Settings before publishing — the chat only loads on your own site.</span>}
      </p>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <section className="space-y-3 rounded-2xl border border-gray-200 bg-white p-5" aria-labelledby="re-look">
            <h2 id="re-look" className="font-bold text-gray-900">How it greets people</h2>
            <label className={label} htmlFor="re-name">
              Name <span className={hint}>(only you see this)</span>
              <input id="re-name" className={input} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={label} htmlFor="re-title">
                Chat heading
                <input id="re-title" className={input} value={config.title} maxLength={120} onChange={(e) => setConfig({ ...config, title: e.target.value })} />
              </label>
              <label className={label} htmlFor="re-intro">
                Line under the heading
                <input id="re-intro" className={input} value={config.intro} maxLength={500} onChange={(e) => setConfig({ ...config, intro: e.target.value })} />
              </label>
            </div>
            <label className={label} htmlFor="re-greet">
              First message
              <input id="re-greet" className={input} value={r.greeting} maxLength={300} onChange={(e) => setR({ greeting: e.target.value })} />
            </label>
            <label className={label} htmlFor="re-tone">
              Tone
              <select id="re-tone" className={input} value={r.tone} onChange={(e) => setR({ tone: e.target.value as ReceptionistSetup["tone"] })}>
                {RECEPTIONIST_TONES.map((t) => (
                  <option key={t} value={t}>
                    {t[0].toUpperCase() + t.slice(1)}
                  </option>
                ))}
              </select>
            </label>
          </section>

          <section className="space-y-3 rounded-2xl border border-gray-200 bg-white p-5" aria-labelledby="re-facts">
            <h2 id="re-facts" className="font-bold text-gray-900">What it knows</h2>
            <p className="text-xs text-gray-500">The receptionist answers only from these facts. If something isn&apos;t here, it says it isn&apos;t sure and takes a message.</p>
            <label className={label} htmlFor="re-about">
              About your business
              <textarea id="re-about" rows={3} className={input} value={r.about} maxLength={2000} onChange={(e) => setR({ about: e.target.value })} />
            </label>
            <label className={label} htmlFor="re-services">
              Services &amp; prices <span className={hint}>(leave prices out and it will never quote one)</span>
              <textarea id="re-services" rows={4} className={input} value={r.services} maxLength={2000} onChange={(e) => setR({ services: e.target.value })} />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={label} htmlFor="re-hours">
                Hours
                <textarea id="re-hours" rows={2} className={input} value={r.hours} maxLength={500} onChange={(e) => setR({ hours: e.target.value })} />
              </label>
              <label className={label} htmlFor="re-loc">
                Location / service area
                <textarea id="re-loc" rows={2} className={input} value={r.location} maxLength={300} onChange={(e) => setR({ location: e.target.value })} />
              </label>
            </div>
          </section>

          <section className="space-y-3 rounded-2xl border border-gray-200 bg-white p-5" aria-labelledby="re-faq">
            <div className="flex items-center justify-between">
              <h2 id="re-faq" className="font-bold text-gray-900">Common questions</h2>
              <button type="button" onClick={() => setR({ faq: [...r.faq, { q: "", a: "" }] })} disabled={r.faq.length >= 20} className="text-sm font-semibold text-navy hover:underline">
                + Add a question
              </button>
            </div>
            {r.faq.length === 0 && <p className="text-xs text-gray-500">None yet. Add the questions customers ask most.</p>}
            <ol className="space-y-3">
              {r.faq.map((f, i) => (
                <li key={i} className="space-y-2 rounded-xl border border-gray-200 p-3">
                  <label className="text-xs font-semibold text-gray-600" htmlFor={`re-q-${i}`}>
                    Question
                    <input id={`re-q-${i}`} className={input} value={f.q} maxLength={200} onChange={(e) => setFaq(i, { q: e.target.value })} />
                  </label>
                  <label className="text-xs font-semibold text-gray-600" htmlFor={`re-a-${i}`}>
                    Answer
                    <textarea id={`re-a-${i}`} rows={2} className={input} value={f.a} maxLength={800} onChange={(e) => setFaq(i, { a: e.target.value })} />
                  </label>
                  <button type="button" onClick={() => setR({ faq: r.faq.filter((_, j) => j !== i) })} className="text-xs font-semibold text-red-600 hover:underline">
                    Remove
                  </button>
                </li>
              ))}
            </ol>
          </section>

          <section className="space-y-3 rounded-2xl border border-gray-200 bg-white p-5" aria-labelledby="re-actions">
            <h2 id="re-actions" className="font-bold text-gray-900">Bookings &amp; messages</h2>
            <label className={label} htmlFor="re-booking">
              Book appointments with
              <select id="re-booking" className={input} value={r.bookingModuleId ?? ""} onChange={(e) => setR({ bookingModuleId: e.target.value || null })}>
                <option value="">Don&apos;t book — take a message instead</option>
                {props.bookingModules.map((b) => (
                  <option key={b.publicId} value={b.publicId}>
                    {b.name}
                    {b.status !== "live" ? " (not live yet)" : ""}
                  </option>
                ))}
              </select>
            </label>
            {props.bookingModules.length === 0 && (
              <p className="text-xs text-gray-500">To let it book appointments, first create an Online booking module with your services and hours.</p>
            )}
            {r.bookingModuleId && props.bookingModules.find((b) => b.publicId === r.bookingModuleId)?.status !== "live" && (
              <p className="text-xs text-amber-700">That booking page isn&apos;t live, so on your site the receptionist will take messages until you publish it.</p>
            )}
            <label className={label} htmlFor="re-follow">
              When it takes a message, it promises
              <input id="re-follow" className={input} value={r.followUp} maxLength={300} onChange={(e) => setR({ followUp: e.target.value })} />
            </label>
            <p className="text-xs text-gray-500">Messages and bookings arrive in your Submissions with the full conversation, and you get the usual email alert.</p>
          </section>
        </div>

        <div className="lg:sticky lg:top-4 lg:self-start">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-700">Test it</p>
            <button type="button" onClick={() => setTestKey((k) => k + 1)} className="text-xs text-gray-500 hover:underline">
              Start over
            </button>
          </div>
          <div className="rounded-2xl bg-gray-100 p-4">
            <ChatWidget
              key={testKey}
              publicId={publicId ?? "m_000000000000000000"}
              businessName={props.businessName}
              logoUrl={props.logoUrl}
              brand={resolveBrand(props.workspaceBrand, config.style)}
              title={config.title}
              intro={config.intro}
              greeting={r.greeting}
              sourceUrl={null}
              send={testSend}
            />
          </div>
          <p className="mt-2 text-xs text-gray-500">Uses what&apos;s on this page right now (even unsaved). Nothing is booked or saved while testing.</p>
        </div>
      </div>
    </div>
  );
}
