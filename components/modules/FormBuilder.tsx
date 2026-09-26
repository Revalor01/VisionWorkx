"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import ModuleForm from "@/components/modules/ModuleForm";
import {
  FIELD_TYPES,
  parseFormConfig,
  resolveBrand,
  type Brand,
  type FieldDef,
  type FieldType,
  type FormConfig,
} from "@/lib/modules/config";

// Owner-facing lead form builder: describe the form in a sentence, get a
// draft, edit anything, see it live, save, publish.

const TYPE_LABEL: Record<FieldType, string> = {
  text: "Short answer",
  email: "Email",
  phone: "Phone",
  select: "Choose from a list",
  textarea: "Long answer",
  file: "Photo or file",
};

const EXAMPLES = [
  "Quote request for plumbing jobs — ask for their address, what's wrong, and a photo.",
  "New patient inquiry for a dental office: name, phone, insurance provider, and preferred time.",
  "Wedding photography inquiry with the date, venue, guest count and budget range.",
];

function toId(label: string, taken: Set<string>): string {
  let base = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 32) || "field";
  if (!/^[a-z]/.test(base)) base = `f_${base}`;
  let id = base;
  for (let i = 2; taken.has(id); i++) id = `${base}_${i}`.slice(0, 40);
  return id;
}

type Step = "describe" | "edit";

export default function FormBuilder(props: {
  slug: string;
  businessName: string;
  logoUrl: string | null;
  workspaceBrand: Brand;
  hasDomains: boolean;
  existing?: { publicId: string; name: string; status: string; config: FormConfig };
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(props.existing ? "edit" : "describe");
  const [description, setDescription] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [note, setNote] = useState("");
  const [name, setName] = useState(props.existing?.name ?? "");
  const [config, setConfig] = useState<FormConfig>(props.existing?.config ?? parseFormConfig({ fields: [] }));
  const [publicId, setPublicId] = useState(props.existing?.publicId ?? null);
  const [status, setStatus] = useState(props.existing?.status ?? "draft");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [previewKey, setPreviewKey] = useState(0);

  const brand = useMemo(() => resolveBrand(props.workspaceBrand, config.style), [props.workspaceBrand, config.style]);
  const set = (patch: Partial<FormConfig>) => {
    setConfig((c) => ({ ...c, ...patch }));
    setMsg(null);
  };
  const setField = (i: number, patch: Partial<FieldDef>) =>
    set({ fields: config.fields.map((f, j) => (j === i ? { ...f, ...patch } : f)) });

  async function draft() {
    setDrafting(true);
    setNote("");
    setMsg(null);
    try {
      const res = await fetch(`/api/workspace/${props.slug}/modules/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Couldn't draft the form.");
      setConfig(body.config);
      setName(body.config.title || "Lead capture form");
      setNote(body.note ?? "");
      setStep("edit");
      setPreviewKey((k) => k + 1);
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Couldn't draft the form." });
    } finally {
      setDrafting(false);
    }
  }

  function addField() {
    const taken = new Set(config.fields.map((f) => f.id));
    set({ fields: [...config.fields, { id: toId("new question", taken), label: "New question", type: "text", required: false, maxLength: 200 }] });
  }
  function move(i: number, d: -1 | 1) {
    const j = i + d;
    if (j < 0 || j >= config.fields.length) return;
    const next = [...config.fields];
    [next[i], next[j]] = [next[j], next[i]];
    set({ fields: next });
  }

  async function save(nextStatus?: "live" | "paused" | "draft") {
    setSaving(true);
    setMsg(null);
    const clean = parseFormConfig(config); // same sanitiser the server uses
    try {
      let id = publicId;
      if (!id) {
        const res = await fetch(`/api/workspace/${props.slug}/modules`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, config: clean }),
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
            ? "Published — your form is live. Copy the snippet on the Modules & install page."
            : nextStatus === "paused"
              ? "Paused — the form is hidden on your site until you publish it again."
              : "Saved.",
      });
      router.refresh();
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Couldn't save." });
    } finally {
      setSaving(false);
    }
  }

  const input = "mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy/20";
  const label = "block text-sm font-semibold text-gray-700";

  if (step === "describe") {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-navy-dark">New lead form</h1>
          <p className="text-sm text-gray-500">Describe the form in plain English. We&apos;ll draft it, and you can change anything before it goes live.</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-6">
          <label htmlFor="fb-desc" className={label}>
            What should the form ask for?
          </label>
          <textarea
            id="fb-desc"
            rows={4}
            maxLength={800}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Quote request for plumbing jobs — ask for their address and a photo of the problem."
            className={input}
          />
          <div className="mt-3 flex flex-wrap gap-2" aria-label="Examples">
            {EXAMPLES.map((ex) => (
              <button key={ex} type="button" onClick={() => setDescription(ex)} className="rounded-full border border-gray-200 px-3 py-1 text-xs text-gray-600 hover:bg-gray-50">
                {ex.split(" — ")[0].split(":")[0]}
              </button>
            ))}
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={draft}
              disabled={drafting || description.trim().length < 8}
              className="rounded-xl bg-navy-dark px-5 py-2.5 font-semibold text-white hover:bg-navy disabled:opacity-50"
            >
              {drafting ? "Drafting your form…" : "Draft my form"}
            </button>
            <button type="button" onClick={() => { setConfig(parseFormConfig({ fields: [
              { id: "name", label: "Full name", type: "text", required: true },
              { id: "email", label: "Email", type: "email", required: true },
            ] })); setName("Lead capture form"); setStep("edit"); }} className="text-sm font-semibold text-navy hover:underline">
              Or start from a blank form
            </button>
          </div>
          <p role="status" aria-live="polite" className="mt-3 text-sm text-red-600">{msg?.kind === "err" ? msg.text : ""}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-navy-dark">{props.existing ? "Edit lead form" : "Your draft form"}</h1>
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
        {!props.hasDomains && !msg && <span className="text-amber-700">Add your website in Settings before publishing — forms only load on your own site.</span>}
      </p>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <section className="space-y-3 rounded-2xl border border-gray-200 bg-white p-5" aria-labelledby="fb-words">
            <h2 id="fb-words" className="font-bold text-gray-900">Words</h2>
            <label className={label} htmlFor="fb-name">Form name <span className="font-normal text-gray-500">(only you see this)</span>
              <input id="fb-name" className={input} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className={label} htmlFor="fb-title">Heading
              <input id="fb-title" className={input} value={config.title} maxLength={120} onChange={(e) => set({ title: e.target.value })} />
            </label>
            <label className={label} htmlFor="fb-intro">Intro line
              <input id="fb-intro" className={input} value={config.intro} maxLength={500} onChange={(e) => set({ intro: e.target.value })} />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={label} htmlFor="fb-btn">Button text
                <input id="fb-btn" className={input} value={config.submitLabel} maxLength={40} onChange={(e) => set({ submitLabel: e.target.value })} />
              </label>
              <label className={label} htmlFor="fb-redirect">After sending, go to <span className="font-normal text-gray-500">(optional)</span>
                <input id="fb-redirect" className={input} value={config.redirectUrl ?? ""} placeholder="https://yoursite.com/thank-you" onChange={(e) => set({ redirectUrl: e.target.value || null })} />
              </label>
            </div>
            <label className={label} htmlFor="fb-success">Thank-you message
              <textarea id="fb-success" rows={2} className={input} value={config.successMessage} maxLength={500} onChange={(e) => set({ successMessage: e.target.value })} />
            </label>
          </section>

          <section className="space-y-3 rounded-2xl border border-gray-200 bg-white p-5" aria-labelledby="fb-payment">
            <div className="flex items-center justify-between">
              <h2 id="fb-payment" className="font-bold text-gray-900">Payment</h2>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={config.payment?.enabled ?? false}
                  onChange={(e) =>
                    set({
                      payment: e.target.checked
                        ? { enabled: true, amountCents: config.payment?.amountCents ?? 5000, label: config.payment?.label || "Deposit" }
                        : null,
                    })
                  }
                />
                Collect a payment on submit
              </label>
            </div>
            {config.payment?.enabled ? (
              <>
                <p className="text-xs text-gray-500">
                  Requires Stripe connected on the Billing page. The customer pays right after submitting, before seeing the thank-you message.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className={label} htmlFor="fb-pay-label">What it&apos;s for <span className="font-normal text-gray-500">(shown to the customer)</span>
                    <input id="fb-pay-label" className={input} value={config.payment.label} maxLength={60} placeholder="Deposit" onChange={(e) => set({ payment: { ...config.payment!, label: e.target.value } })} />
                  </label>
                  <label className={label} htmlFor="fb-pay-amount">Amount (USD)
                    <input
                      id="fb-pay-amount"
                      type="number"
                      min="0.5"
                      step="0.01"
                      className={input}
                      value={(config.payment.amountCents / 100).toFixed(2)}
                      onChange={(e) => set({ payment: { ...config.payment!, amountCents: Math.max(50, Math.round(Number(e.target.value || 0) * 100)) } })}
                    />
                  </label>
                </div>
              </>
            ) : (
              <p className="text-xs text-gray-500">Off — this form just collects the fields below.</p>
            )}
          </section>

          <section className="space-y-3 rounded-2xl border border-gray-200 bg-white p-5" aria-labelledby="fb-fields">
            <div className="flex items-center justify-between">
              <h2 id="fb-fields" className="font-bold text-gray-900">Questions</h2>
              <button type="button" onClick={addField} disabled={config.fields.length >= 30} className="text-sm font-semibold text-navy hover:underline">+ Add a question</button>
            </div>
            <ol className="space-y-3">
              {config.fields.map((f, i) => (
                <li key={i} className="rounded-xl border border-gray-200 p-3">
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_170px]">
                    <label className="text-xs font-semibold text-gray-600" htmlFor={`fl-${i}`}>Question
                      <input
                        id={`fl-${i}`}
                        className={input}
                        value={f.label}
                        maxLength={120}
                        onChange={(e) => {
                          const labelText = e.target.value;
                          // Questions added in this editor get a readable key from their wording;
                          // existing keys never change (past submissions are stored under them).
                          if (f.id.startsWith("new_question")) {
                            const taken = new Set(config.fields.filter((_, j) => j !== i).map((x) => x.id));
                            setField(i, { label: labelText, id: toId(labelText || "question", taken) });
                          } else setField(i, { label: labelText });
                        }}
                      />
                    </label>
                    <label className="text-xs font-semibold text-gray-600" htmlFor={`ft-${i}`}>Answer type
                      <select
                        id={`ft-${i}`}
                        className={input}
                        value={f.type}
                        onChange={(e) => {
                          const type = e.target.value as FieldType;
                          setField(i, { type, ...(type === "select" && !f.options?.length ? { options: ["Option 1", "Option 2"] } : {}) });
                        }}
                      >
                        {FIELD_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
                      </select>
                    </label>
                  </div>
                  {f.type === "select" && (
                    <label className="mt-2 block text-xs font-semibold text-gray-600" htmlFor={`fo-${i}`}>Choices (one per line)
                      <textarea
                        id={`fo-${i}`}
                        rows={3}
                        className={input}
                        value={(f.options ?? []).join("\n")}
                        onChange={(e) => setField(i, { options: e.target.value.split("\n").slice(0, 50) })}
                      />
                    </label>
                  )}
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                    <label className="flex items-center gap-2 text-gray-700" htmlFor={`fr-${i}`}>
                      <input id={`fr-${i}`} type="checkbox" checked={f.required} onChange={(e) => setField(i, { required: e.target.checked })} />
                      Required
                    </label>
                    <div className="flex gap-1">
                      <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move "${f.label}" up`} className="rounded-lg border px-2 py-1 disabled:opacity-30">↑</button>
                      <button type="button" onClick={() => move(i, 1)} disabled={i === config.fields.length - 1} aria-label={`Move "${f.label}" down`} className="rounded-lg border px-2 py-1 disabled:opacity-30">↓</button>
                      <button type="button" onClick={() => set({ fields: config.fields.filter((_, j) => j !== i) })} aria-label={`Remove "${f.label}"`} className="rounded-lg border border-red-200 px-2 py-1 text-red-600">Remove</button>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section className="space-y-3 rounded-2xl border border-gray-200 bg-white p-5" aria-labelledby="fb-style">
            <div className="flex items-center justify-between">
              <h2 id="fb-style" className="font-bold text-gray-900">Style</h2>
              <button type="button" onClick={() => set({ style: {} })} className="text-sm text-gray-500 hover:underline">Use my workspace branding</button>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className={label} htmlFor="fs-color">Color
                <input id="fs-color" type="color" className="mt-1 h-10 w-full rounded-lg border border-gray-300 p-1" value={brand.color} onChange={(e) => set({ style: { ...config.style, color: e.target.value } })} />
              </label>
              <label className={label} htmlFor="fs-font">Font
                <select id="fs-font" className={input} value={brand.font} onChange={(e) => set({ style: { ...config.style, font: e.target.value as Brand["font"] } })}>
                  <option value="modern">Modern</option><option value="classic">Classic</option><option value="friendly">Friendly</option>
                </select>
              </label>
              <label className={label} htmlFor="fs-radius">Corners
                <select id="fs-radius" className={input} value={brand.radius} onChange={(e) => set({ style: { ...config.style, radius: Number(e.target.value) } })}>
                  <option value={2}>Square</option><option value={10}>Soft</option><option value={18}>Round</option>
                </select>
              </label>
            </div>
          </section>
        </div>

        <div className="lg:sticky lg:top-4 lg:self-start">
          <p className="mb-2 text-sm font-semibold text-gray-700">Live preview</p>
          <div className="rounded-2xl bg-gray-100 p-4">
            <ModuleForm
              key={previewKey}
              publicId={publicId ?? "m_000000000000000000"}
              businessName={props.businessName}
              logoUrl={props.logoUrl}
              brand={brand}
              config={parseFormConfig(config)}
              sourceUrl={null}
              preview
            />
          </div>
          <p className="mt-2 text-xs text-gray-500">This is exactly what visitors see. Submitting here doesn&apos;t save anything.</p>
        </div>
      </div>
    </div>
  );
}
