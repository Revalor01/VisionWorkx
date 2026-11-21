"use client";

import { useMemo, useState, type ReactNode } from "react";
import { money } from "@/lib/needsAnalyzer/format";
import {
  CARE_PLANS,
  CONTENTS,
  DEFAULT_INPUT,
  DEFAULT_PRICES,
  DESIGNS,
  EMAILS,
  FEATURES,
  HOSTING,
  PLATFORMS,
  PRICES_AS_OF,
  REGISTRARS,
  SIZES,
  hostingFor,
  simulate,
  type FeatureKey,
  type SimInput,
  type SimPrices,
  type SimStep,
} from "@/lib/needsAnalyzer/buildSim";
import { BTN, BTN_PRIMARY, INPUT, NaShell, NUM, useClientMode } from "./ui";

// The shared CARD, with the Revalor brown/gold outline (other tabs keep the grey border).
const GOLD_CARD = "mb-6 rounded-xl border border-[#B8860B] bg-white p-5 shadow-sm";

// Website Build Simulator: pick the high-level choices, get every step from hosting to
// deployment with hours, the one-time price and the running costs, as a
// one-page assessment that prints cleanly. Nothing is saved. Client mode hides
// Revalor's internal cost, margin and the price editor.

export default function BuildSimulator(props: { currency: string; internalRate: number; targetMarginPct: number }) {
  return (
    <NaShell active="simulator">
      <Simulator {...props} />
    </NaShell>
  );
}

function Simulator({ currency, internalRate, targetMarginPct }: { currency: string; internalRate: number; targetMarginPct: number }) {
  const { on: clientMode } = useClientMode();
  const [input, setInput] = useState<SimInput>(DEFAULT_INPUT);
  const [prices, setPrices] = useState<SimPrices>(DEFAULT_PRICES);
  const [rate, setRate] = useState(internalRate);
  const [margin, setMargin] = useState(targetMarginPct);
  const [showPrices, setShowPrices] = useState(false);
  const [client, setClient] = useState("");

  const r = useMemo(() => simulate(input, prices, { internalRate: rate, targetMarginPct: margin }), [input, prices, rate, margin]);
  const m = (n: number) => money(currency, n);
  const m2 = (n: number) => (n > 0 && n < 10 ? `${currency || "$"}${n.toFixed(2)}` : m(n));
  const set = (patch: Partial<SimInput>) => setInput((cur) => ({ ...cur, ...patch }));
  const toggle = (f: FeatureKey) => set({ features: input.features.includes(f) ? input.features.filter((x) => x !== f) : [...input.features, f] });
  const platform = PLATFORMS.find((p) => p.key === r.input.platform)!;
  const phases = [...new Set(r.steps.map((s) => s.phase))];

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)] print:block">
      {/* Choices */}
      <div className="print:hidden">
        <div className={GOLD_CARD}>
          <h2 className="mb-1 text-lg font-semibold text-zinc-900">Website Build Simulator</h2>
          <p className="mb-4 text-sm text-zinc-500">Pick the high-level choices; the assessment on the right updates as you go. Nothing is saved.</p>
          <div className="space-y-3">
            <Field label="Client or project name (optional)">
              <input className={INPUT} value={client} onChange={(e) => setClient(e.target.value)} placeholder="e.g. Smith Plumbing" />
            </Field>
            <Field label="Platform" hint={platform.note}>
              <Select value={input.platform} onChange={(v) => set({ platform: v as SimInput["platform"], hosting: hostingFor(v as SimInput["platform"])[0] })} options={PLATFORMS} />
            </Field>
            <Field label="Hosting" hint={HOSTING.find((h) => h.key === r.input.hosting)?.note}>
              <Select value={r.input.hosting} onChange={(v) => set({ hosting: v as SimInput["hosting"] })} options={HOSTING.filter((h) => hostingFor(input.platform).includes(h.key))} disabled={hostingFor(input.platform).length < 2} />
            </Field>
            <Field label="Domain registrar">
              <Select value={input.registrar} onChange={(v) => set({ registrar: v as SimInput["registrar"] })} options={REGISTRARS} />
            </Field>
            <div className="grid grid-cols-[1fr_88px] gap-2">
              <Field label="Business email">
                <Select value={input.email} onChange={(v) => set({ email: v as SimInput["email"] })} options={EMAILS} />
              </Field>
              <Field label="Mailboxes">
                <input type="number" min={1} max={50} className={INPUT} value={r.input.mailboxes} disabled={input.email === "none"} onChange={(e) => set({ mailboxes: Number(e.target.value) })} />
              </Field>
            </div>
            <Field label="Size">
              <Select value={input.size} onChange={(v) => set({ size: v as SimInput["size"] })} options={SIZES} />
            </Field>
            <Field label="Design">
              <Select value={input.design} onChange={(v) => set({ design: v as SimInput["design"] })} options={DESIGNS} />
            </Field>
            <Field label="Content">
              <Select value={input.content} onChange={(v) => set({ content: v as SimInput["content"] })} options={CONTENTS} />
            </Field>
            <Field label="Features">
              <div className="space-y-1.5">
                {FEATURES.map((f) => (
                  <label key={f.key} className="flex items-start gap-2 text-sm text-zinc-700">
                    <input type="checkbox" className="mt-0.5" checked={input.features.includes(f.key)} onChange={() => toggle(f.key)} />
                    {f.label}
                  </label>
                ))}
              </div>
            </Field>
            <Field label="Care plan after launch">
              <Select value={input.care} onChange={(v) => set({ care: v as SimInput["care"] })} options={CARE_PLANS} />
            </Field>
          </div>
        </div>

        {!clientMode && (
          <div className={GOLD_CARD}>
            <h3 className="mb-3 text-sm font-semibold text-zinc-800">Your rates</h3>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2">
                Internal rate <input type="number" className={NUM} value={rate} onChange={(e) => setRate(Number(e.target.value) || 0)} /> /hr
              </label>
              <label className="flex items-center gap-2">
                Target margin <input type="number" className={NUM} value={margin} onChange={(e) => setMargin(Math.min(95, Number(e.target.value) || 0))} /> %
              </label>
            </div>
            <p className="mt-2 text-xs text-zinc-500">Start from Catalog &amp; pricing; changes here aren&apos;t saved.</p>
            <button type="button" className={`${BTN} mt-4`} onClick={() => setShowPrices((v) => !v)}>
              {showPrices ? "Hide" : "Edit"} third-party prices
            </button>
            {showPrices && <PriceEditor prices={prices} setPrices={setPrices} />}
          </div>
        )}
      </div>

      {/* The one-page assessment */}
      <article className="rounded-xl border-2 border-[#B8860B] bg-white p-6 shadow-sm print:border-0 print:p-0 print:text-[11px] print:shadow-none">
        <header className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-zinc-200 pb-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-[#B8860B]">Revalor · Website build assessment</p>
            <h2 className="text-xl font-bold text-[#1A3A5C]">{client.trim() || "Website build"}</h2>
            <p className="text-sm text-zinc-600">
              {platform.label}
              {r.input.hosting !== "included" ? ` on ${HOSTING.find((h) => h.key === r.input.hosting)?.label}` : ""} · {r.pages} pages ·{" "}
              {DESIGNS.find((d) => d.key === r.input.design)?.label.toLowerCase()}
            </p>
          </div>
          <button type="button" className={`${BTN_PRIMARY} print:hidden`} onClick={() => window.print()}>
            Print / Save PDF
          </button>
        </header>

        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4 print:mb-3 print:grid-cols-4 print:gap-2">
          <Tile label="Build price" value={m(r.buildPrice)} sub="one-time" />
          <Tile label="Running costs" value={`${m(r.runningMonthly)}/mo`} sub={`${m(r.runningYearly)}/yr`} />
          <Tile label="Care plan" value={r.carePrice ? `${m(r.carePrice)}/mo` : "—"} sub={CARE_PLANS.find((c) => c.key === r.input.care)?.label.split(" —")[0]} />
          <Tile label="Timeline" value={`~${r.calendarWeeks} wk${r.calendarWeeks === 1 ? "" : "s"}`} sub={`${r.totalHours} hrs of work`} />
        </div>

        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">Every step, hosting to deployment</h3>
        <div className="mb-5 text-sm print:mb-3 print:columns-2 print:gap-6 print:text-[11px]">
          {phases.map((phase) => (
            <PhaseRows key={phase} phase={phase} steps={r.steps.filter((s) => s.phase === phase)} />
          ))}
          <div className="flex justify-between gap-3 border-t border-zinc-200 py-1.5 text-zinc-500 print:break-inside-avoid print:py-0.5">
            <span>Contingency (15%) — feedback rounds, surprises</span>
            <span className="tabular-nums">{r.contingencyHours} h</span>
          </div>
          <div className="flex justify-between gap-3 border-t-2 border-zinc-300 py-1.5 font-semibold text-zinc-900 print:break-inside-avoid print:py-0.5">
            <span>Total</span>
            <span className="tabular-nums">{r.totalHours} h</span>
          </div>
        </div>

        <div className="mb-5 grid gap-5 sm:grid-cols-2 print:mb-3 print:grid-cols-2 print:gap-4">
          <section>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">One-time</h3>
            <dl className="space-y-1 text-sm print:space-y-0 print:text-[11px]">
              <Row label="Build, launch & handoff" value={m(r.buildPrice)} strong />
              {!clientMode && (
                <>
                  <Row label={`Revalor cost (${r.totalHours} h × ${m(rate)})`} value={m(r.buildCost)} muted />
                  <Row label="Margin" value={`${m(r.buildPrice - r.buildCost)} (${r.buildPrice ? Math.round(((r.buildPrice - r.buildCost) / r.buildPrice) * 100) : 0}%)`} muted />
                </>
              )}
            </dl>
          </section>
          <section>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">Running costs (monthly)</h3>
            <dl className="space-y-1 text-sm print:space-y-0 print:text-[11px]">
              {r.running.map((l) => (
                <Row key={l.key} label={`${l.label}${clientMode ? "" : ` · ${l.payer} pays`}`} value={m2(l.monthly)} />
              ))}
              <Row label="Total third-party" value={`${m2(r.runningMonthly)} · ${m(r.runningYearly)}/yr`} strong />
              {r.carePrice > 0 && <Row label="Care plan (Revalor)" value={m(r.carePrice)} strong />}
              {!clientMode && r.carePrice > 0 && <Row label="Care plan cost to Revalor" value={m(r.careCost)} muted />}
            </dl>
          </section>
        </div>

        {r.risks.length > 0 && (
          <section className="mb-4">
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">Watch-outs</h3>
            <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-700 print:space-y-0 print:text-[11px]">
              {r.risks.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </section>
        )}

        <p className="border-t border-zinc-200 pt-3 text-xs text-zinc-500">
          High-level estimate, not a quote. Third-party prices are US list prices as of {PRICES_AS_OF} (annual billing where cheaper) and change often — confirm each one before
          quoting. Timeline assumes about 6 focused hours a day and prompt client feedback.
        </p>
      </article>
    </div>
  );
}

function PhaseRows({ phase, steps }: { phase: string; steps: SimStep[] }) {
  return (
    <div>
      <div className="pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-[#1A3A5C] print:break-after-avoid print:pt-1 print:pb-0.5 print:text-[10px]">{phase}</div>
      {steps.map((s) => (
        <div key={s.key} className="flex justify-between gap-3 border-t border-zinc-100 py-1.5 print:break-inside-avoid print:py-0.5">
          <div>
            <div className="font-medium text-zinc-800">{s.label}</div>
            <div className="text-xs text-zinc-500 print:hidden">{s.detail}</div>
          </div>
          <div className="shrink-0 tabular-nums text-zinc-700">{s.hours} h</div>
        </div>
      ))}
    </div>
  );
}

function PriceEditor({ prices, setPrices }: { prices: SimPrices; setPrices: (p: SimPrices) => void }) {
  const group = <K extends keyof SimPrices>(key: K, title: string, labels: { key: string; label: string }[], unit: string) => {
    const values = prices[key] as Record<string, number>;
    return (
      <div className="mt-3">
        <div className="mb-1 text-xs font-semibold text-zinc-600">
          {title} <span className="font-normal text-zinc-400">({unit})</span>
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
          {labels
            .filter((l) => l.key in values)
            .map((l) => (
              <label key={l.key} className="flex items-center justify-between gap-2 text-xs text-zinc-600">
                <span className="truncate">{l.label.replace(/ \(.*\)$/, "")}</span>
                <input
                  type="number"
                  step="0.01"
                  className={`${NUM} w-20`}
                  value={values[l.key]}
                  onChange={(e) => setPrices({ ...prices, [key]: { ...values, [l.key]: Number(e.target.value) || 0 } })}
                />
              </label>
            ))}
        </div>
      </div>
    );
  };
  return (
    <div className="mt-2">
      <p className="text-xs text-zinc-500">Starting points as of {PRICES_AS_OF}. Edits last until you leave the page.</p>
      {group("platformMonthly", "Platform plan", PLATFORMS, "per month")}
      {group("platformUpgradeMonthly", "Extra for store / CMS tier", PLATFORMS, "per month")}
      {group("hostingMonthly", "Hosting", HOSTING.filter((h) => h.key !== "included"), "per month")}
      {group("domainYearly", "Domain", REGISTRARS, "per year")}
      {group("emailPerMailboxMonthly", "Email", EMAILS.filter((e) => e.key !== "none"), "per mailbox / month")}
      {group("featureMonthly", "Feature apps", FEATURES, "per month")}
      <label className="mt-3 flex items-center justify-between gap-2 text-xs text-zinc-600">
        WordPress theme & plugin licences (per year)
        <input type="number" className={`${NUM} w-20`} value={prices.wordpressLicencesYearly} onChange={(e) => setPrices({ ...prices, wordpressLicencesYearly: Number(e.target.value) || 0 })} />
      </label>
      <button type="button" className={`${BTN} mt-3`} onClick={() => setPrices(DEFAULT_PRICES)}>
        Reset prices
      </button>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-zinc-600">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-zinc-500">{hint}</span>}
    </label>
  );
}

function Select({ value, onChange, options, disabled }: { value: string; onChange: (v: string) => void; options: { key: string; label: string }[]; disabled?: boolean }) {
  return (
    <select className={INPUT} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => (
        <option key={o.key} value={o.key}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-[#B8860B] bg-zinc-50 p-3 print:p-2">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="text-lg font-bold text-[#1A3A5C] print:text-base">{value}</div>
      {sub && <div className="text-xs text-zinc-500">{sub}</div>}
    </div>
  );
}

function Row({ label, value, strong, muted }: { label: string; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 ${strong ? "font-semibold text-zinc-900" : muted ? "text-zinc-500" : "text-zinc-700"}`}>
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
