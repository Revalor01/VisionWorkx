"use client";

import { MAX_OPTIONS, MAX_QUOTE_INPUTS, ROUND_TO, type QuoteInput, type QuoteOption, type QuotePricing } from "@/lib/modules/quote";

// Owner-side editor for a quote calculator's pricing (used by FormBuilder).
// Prices are stored in cents and edited in dollars.

const KIND_LABEL: Record<QuoteInput["kind"], string> = {
  slider: "Slider",
  counter: "Counter",
  choice: "Pick one",
  addons: "Add-ons",
};
const KIND_HINT: Record<QuoteInput["kind"], string> = {
  slider: "A size or amount on a scale, like square feet or hours.",
  counter: "A small count, like bedrooms or windows.",
  choice: "Visitors pick exactly one, like a service level.",
  addons: "Extras visitors can tick, each with its own price.",
};

const input = "mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy/20";
const small = "text-xs font-semibold text-gray-600";

function dollars(c: number): string {
  return String(Math.round(c) / 100);
}
function toCents(v: string, fractional = false): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return fractional ? Math.round(n * 10000) / 100 : Math.round(n * 100);
}
function num(v: string, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function newId(label: string, taken: Set<string>): string {
  let base = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 32) || "input";
  if (!/^[a-z]/.test(base)) base = `i_${base}`;
  let id = base;
  for (let i = 2; taken.has(id); i++) id = `${base}_${i}`;
  return id;
}

function blank(kind: QuoteInput["kind"], taken: Set<string>): QuoteInput {
  if (kind === "slider")
    return { kind, id: newId("size", taken), label: "Size", min: 0, max: 5000, step: 100, default: 1000, unit: "sq ft", included: 0, pricePerUnitCents: 5 };
  if (kind === "counter") return { kind, id: newId("rooms", taken), label: "Rooms", min: 0, max: 10, default: 1, pricePerUnitCents: 1500 };
  if (kind === "choice")
    return {
      kind,
      id: newId("service_level", taken),
      label: "Service level",
      options: [
        { label: "Standard", priceCents: 0 },
        { label: "Deluxe", priceCents: 5000 },
      ],
    };
  return { kind, id: newId("extras", taken), label: "Extras", options: [{ label: "Extra item", priceCents: 2500 }] };
}

export default function QuotePricingEditor(props: { value: QuotePricing; onChange: (next: QuotePricing) => void }) {
  const p = props.value;
  const set = (patch: Partial<QuotePricing>) => props.onChange({ ...p, ...patch });
  const setInput = (i: number, next: QuoteInput) => set({ inputs: p.inputs.map((x, j) => (j === i ? next : x)) });
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= p.inputs.length) return;
    const next = [...p.inputs];
    [next[i], next[j]] = [next[j], next[i]];
    set({ inputs: next });
  };
  const add = (kind: QuoteInput["kind"]) => set({ inputs: [...p.inputs, blank(kind, new Set(p.inputs.map((x) => x.id)))] });

  // A render helper, not a component: a component declared here would remount
  // on every keystroke and steal focus from the price inputs.
  function renderOptions(i: number, item: Extract<QuoteInput, { options: QuoteOption[] }>) {
    const setOpt = (k: number, patch: Partial<QuoteOption>) =>
      setInput(i, { ...item, options: item.options.map((o, j) => (j === k ? { ...o, ...patch } : o)) });
    return (
      <div className="mt-2 space-y-2">
        {item.options.map((o, k) => (
          <div key={k} className="grid grid-cols-[minmax(0,1fr)_110px_auto] items-end gap-2">
            <label className={small} htmlFor={`qo-${i}-${k}`}>
              Option
              <input id={`qo-${i}-${k}`} className={input} value={o.label} maxLength={80} onChange={(e) => setOpt(k, { label: e.target.value })} />
            </label>
            <label className={small} htmlFor={`qp-${i}-${k}`}>
              {item.kind === "choice" ? "Price ($)" : "Adds ($)"}
              <input id={`qp-${i}-${k}`} type="number" min="0" step="0.01" className={input} value={dollars(o.priceCents)} onChange={(e) => setOpt(k, { priceCents: toCents(e.target.value) })} />
            </label>
            <button
              type="button"
              onClick={() => setInput(i, { ...item, options: item.options.filter((_, j) => j !== k) })}
              disabled={item.options.length <= (item.kind === "choice" ? 2 : 1)}
              aria-label={`Remove option "${o.label}"`}
              className="mb-0.5 rounded-lg border border-red-200 px-2 py-2 text-xs text-red-600 disabled:opacity-30"
            >
              Remove
            </button>
          </div>
        ))}
        {item.options.length < MAX_OPTIONS && (
          <button
            type="button"
            onClick={() => setInput(i, { ...item, options: [...item.options, { label: `Option ${item.options.length + 1}`, priceCents: 0 }] })}
            className="text-sm font-semibold text-navy hover:underline"
          >
            + Add an option
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-sm font-semibold text-gray-700" htmlFor="qp-base">
          Starting price ($)
          <input id="qp-base" type="number" min="0" step="0.01" className={input} value={dollars(p.basePriceCents)} onChange={(e) => set({ basePriceCents: toCents(e.target.value) })} />
        </label>
        <label className="block text-sm font-semibold text-gray-700" htmlFor="qp-unit">
          Price is <span className="font-normal text-gray-500">(e.g. per visit)</span>
          <input id="qp-unit" className={input} value={p.unitLabel} maxLength={30} placeholder="per visit" onChange={(e) => set({ unitLabel: e.target.value })} />
        </label>
        <label className="block text-sm font-semibold text-gray-700" htmlFor="qp-min">
          Minimum job ($)
          <input id="qp-min" type="number" min="0" step="0.01" className={input} value={dollars(p.minimumCents)} onChange={(e) => set({ minimumCents: toCents(e.target.value) })} />
        </label>
      </div>

      <ol className="space-y-3">
        {p.inputs.map((item, i) => (
          <li key={i} className="rounded-xl border border-gray-200 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700">{KIND_LABEL[item.kind]}</span>
              <div className="flex gap-1 text-sm">
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move "${item.label}" up`} className="rounded-lg border px-2 py-1 disabled:opacity-30">
                  ↑
                </button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === p.inputs.length - 1} aria-label={`Move "${item.label}" down`} className="rounded-lg border px-2 py-1 disabled:opacity-30">
                  ↓
                </button>
                <button type="button" onClick={() => set({ inputs: p.inputs.filter((_, j) => j !== i) })} aria-label={`Remove "${item.label}"`} className="rounded-lg border border-red-200 px-2 py-1 text-red-600">
                  Remove
                </button>
              </div>
            </div>
            <label className={`${small} mt-2 block`} htmlFor={`ql-${i}`}>
              Label visitors see
              <input id={`ql-${i}`} className={input} value={item.label} maxLength={80} onChange={(e) => setInput(i, { ...item, label: e.target.value })} />
            </label>

            {item.kind === "slider" && (
              <div className="mt-2 grid gap-2 sm:grid-cols-4">
                <label className={small} htmlFor={`qs-min-${i}`}>
                  From
                  <input id={`qs-min-${i}`} type="number" min="0" className={input} value={item.min} onChange={(e) => setInput(i, { ...item, min: num(e.target.value) })} />
                </label>
                <label className={small} htmlFor={`qs-max-${i}`}>
                  To
                  <input id={`qs-max-${i}`} type="number" min="1" className={input} value={item.max} onChange={(e) => setInput(i, { ...item, max: num(e.target.value, item.max) })} />
                </label>
                <label className={small} htmlFor={`qs-step-${i}`}>
                  Step
                  <input id={`qs-step-${i}`} type="number" min="1" className={input} value={item.step} onChange={(e) => setInput(i, { ...item, step: Math.max(1, num(e.target.value, 1)) })} />
                </label>
                <label className={small} htmlFor={`qs-unit-${i}`}>
                  Unit
                  <input id={`qs-unit-${i}`} className={input} value={item.unit} maxLength={20} placeholder="sq ft" onChange={(e) => setInput(i, { ...item, unit: e.target.value })} />
                </label>
                <label className={small} htmlFor={`qs-def-${i}`}>
                  Starts at
                  <input id={`qs-def-${i}`} type="number" className={input} value={item.default} onChange={(e) => setInput(i, { ...item, default: num(e.target.value, item.min) })} />
                </label>
                <label className={small} htmlFor={`qs-inc-${i}`}>
                  Included in price
                  <input id={`qs-inc-${i}`} type="number" min="0" className={input} value={item.included} onChange={(e) => setInput(i, { ...item, included: num(e.target.value) })} />
                </label>
                <label className={`${small} sm:col-span-2`} htmlFor={`qs-ppu-${i}`}>
                  Price per {item.unit || "unit"} above that ($)
                  <input
                    id={`qs-ppu-${i}`}
                    type="number"
                    min="0"
                    step="0.001"
                    className={input}
                    value={Math.round(item.pricePerUnitCents * 100) / 10000}
                    onChange={(e) => setInput(i, { ...item, pricePerUnitCents: toCents(e.target.value, true) })}
                  />
                </label>
              </div>
            )}

            {item.kind === "counter" && (
              <div className="mt-2 grid gap-2 sm:grid-cols-4">
                <label className={small} htmlFor={`qc-min-${i}`}>
                  Lowest
                  <input id={`qc-min-${i}`} type="number" min="0" className={input} value={item.min} onChange={(e) => setInput(i, { ...item, min: Math.round(num(e.target.value)) })} />
                </label>
                <label className={small} htmlFor={`qc-max-${i}`}>
                  Highest
                  <input id={`qc-max-${i}`} type="number" min="1" className={input} value={item.max} onChange={(e) => setInput(i, { ...item, max: Math.round(num(e.target.value, item.max)) })} />
                </label>
                <label className={small} htmlFor={`qc-def-${i}`}>
                  Starts at
                  <input id={`qc-def-${i}`} type="number" className={input} value={item.default} onChange={(e) => setInput(i, { ...item, default: Math.round(num(e.target.value, item.min)) })} />
                </label>
                <label className={small} htmlFor={`qc-ppu-${i}`}>
                  Price each ($)
                  <input id={`qc-ppu-${i}`} type="number" min="0" step="0.01" className={input} value={dollars(item.pricePerUnitCents)} onChange={(e) => setInput(i, { ...item, pricePerUnitCents: toCents(e.target.value) })} />
                </label>
              </div>
            )}

            {(item.kind === "choice" || item.kind === "addons") && renderOptions(i, item)}
            <p className="mt-2 text-xs text-gray-500">{KIND_HINT[item.kind]}</p>
          </li>
        ))}
      </ol>

      {p.inputs.length < MAX_QUOTE_INPUTS && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-gray-600">Add:</span>
          {(Object.keys(KIND_LABEL) as QuoteInput["kind"][]).map((k) => (
            <button key={k} type="button" onClick={() => add(k)} className="rounded-full border border-gray-300 px-3 py-1 font-semibold text-navy hover:bg-gray-50">
              + {KIND_LABEL[k]}
            </button>
          ))}
        </div>
      )}

      <div className="rounded-xl border border-gray-200 p-3">
        <label className="flex items-center gap-2 text-sm font-semibold text-gray-700" htmlFor="qp-freq">
          <input
            id="qp-freq"
            type="checkbox"
            checked={!!p.frequency}
            onChange={(e) =>
              set({
                frequency: e.target.checked
                  ? {
                      label: "How often?",
                      options: [
                        { label: "One-time", discountPct: 0 },
                        { label: "Monthly", discountPct: 5 },
                        { label: "Weekly", discountPct: 15 },
                      ],
                    }
                  : null,
              })
            }
          />
          Discounts for repeat work
        </label>
        {p.frequency && (
          <div className="mt-2 space-y-2">
            <label className={small} htmlFor="qp-freq-label">
              Question
              <input id="qp-freq-label" className={input} value={p.frequency.label} maxLength={80} onChange={(e) => set({ frequency: { ...p.frequency!, label: e.target.value } })} />
            </label>
            {p.frequency.options.map((o, k) => (
              <div key={k} className="grid grid-cols-[minmax(0,1fr)_110px_auto] items-end gap-2">
                <label className={small} htmlFor={`qf-${k}`}>
                  Option
                  <input
                    id={`qf-${k}`}
                    className={input}
                    value={o.label}
                    maxLength={40}
                    onChange={(e) => set({ frequency: { ...p.frequency!, options: p.frequency!.options.map((x, j) => (j === k ? { ...x, label: e.target.value } : x)) } })}
                  />
                </label>
                <label className={small} htmlFor={`qfd-${k}`}>
                  Discount %
                  <input
                    id={`qfd-${k}`}
                    type="number"
                    min="0"
                    max="50"
                    className={input}
                    value={o.discountPct}
                    onChange={(e) =>
                      set({
                        frequency: {
                          ...p.frequency!,
                          options: p.frequency!.options.map((x, j) => (j === k ? { ...x, discountPct: Math.min(50, Math.max(0, Math.round(num(e.target.value)))) } : x)),
                        },
                      })
                    }
                  />
                </label>
                <button
                  type="button"
                  onClick={() => set({ frequency: { ...p.frequency!, options: p.frequency!.options.filter((_, j) => j !== k) } })}
                  disabled={p.frequency!.options.length <= 2}
                  aria-label={`Remove "${o.label}"`}
                  className="mb-0.5 rounded-lg border border-red-200 px-2 py-2 text-xs text-red-600 disabled:opacity-30"
                >
                  Remove
                </button>
              </div>
            ))}
            {p.frequency.options.length < 6 && (
              <button
                type="button"
                onClick={() => set({ frequency: { ...p.frequency!, options: [...p.frequency!.options, { label: "Every 2 weeks", discountPct: 10 }] } })}
                className="text-sm font-semibold text-navy hover:underline"
              >
                + Add an option
              </button>
            )}
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-sm font-semibold text-gray-700" htmlFor="qp-low">
          Range below (%)
          <input id="qp-low" type="number" min="0" max="50" className={input} value={p.rangeLowPct} onChange={(e) => set({ rangeLowPct: Math.min(50, Math.max(0, Math.round(num(e.target.value)))) })} />
        </label>
        <label className="block text-sm font-semibold text-gray-700" htmlFor="qp-high">
          Range above (%)
          <input id="qp-high" type="number" min="0" max="100" className={input} value={p.rangeHighPct} onChange={(e) => set({ rangeHighPct: Math.min(100, Math.max(0, Math.round(num(e.target.value)))) })} />
        </label>
        <label className="block text-sm font-semibold text-gray-700" htmlFor="qp-round">
          Round to
          <select id="qp-round" className={input} value={p.roundToDollars} onChange={(e) => set({ roundToDollars: Number(e.target.value) })}>
            {ROUND_TO.map((r) => (
              <option key={r} value={r}>
                ${r}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-xs text-gray-500">
        Visitors see a range around your calculated price. Set both to 0 to show a single price. The exact quote is always yours to confirm.
      </p>
    </div>
  );
}
