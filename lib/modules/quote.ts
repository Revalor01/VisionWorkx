// Quote / estimate calculator (A7-C). The owner prices a handful of inputs;
// visitors see an instant estimate range, then send their details as a lead.
//
// Pricing lives in the module config under `quote` (the rest of the config is
// an ordinary FormConfig whose fields are the contact questions), so contact
// validation, uploads, emails and webhooks all reuse the form code.
//
// computeEstimate() is pure and shared by the owner preview, the visitor's
// browser and the submit route. The server always recomputes from the
// visitor's answers -- a submitted price is never trusted.
//
// Money is integer cents throughout.

export type QuoteInput =
  | {
      kind: "slider";
      id: string;
      label: string;
      min: number;
      max: number;
      step: number;
      default: number;
      unit: string; // "sq ft"
      included: number; // units included in the base price
      pricePerUnitCents: number; // per unit above `included`
    }
  | { kind: "counter"; id: string; label: string; min: number; max: number; default: number; pricePerUnitCents: number }
  | { kind: "choice"; id: string; label: string; options: QuoteOption[] }
  | { kind: "addons"; id: string; label: string; options: QuoteOption[] };

export interface QuoteOption {
  label: string;
  priceCents: number;
}

export interface FrequencyOption {
  label: string;
  discountPct: number; // 0-50
}

export interface QuotePricing {
  basePriceCents: number;
  inputs: QuoteInput[];
  frequency: { label: string; options: FrequencyOption[] } | null;
  rangeLowPct: number; // estimate shown from subtotal*(1-low%) ...
  rangeHighPct: number; // ... to subtotal*(1+high%)
  roundToDollars: number; // 1, 5, 10, 25, 50 or 100
  minimumCents: number;
  unitLabel: string; // "per visit", "per project" -- may be empty
}

export type QuoteAnswers = Record<string, number | number[]>;

export interface Estimate {
  subtotalCents: number;
  lowCents: number;
  highCents: number;
  text: string; // "$205 – $250 per visit"
}

export const QUOTE_INPUT_KINDS = ["slider", "counter", "choice", "addons"] as const;
export const ROUND_TO = [1, 5, 10, 25, 50, 100] as const;
export const MAX_QUOTE_INPUTS = 12;
export const MAX_OPTIONS = 12;
const MAX_PRICE_CENTS = 10_000_000; // $100,000 per line keeps totals sane
const ID_RE = /^[a-z][a-z0-9_]{0,39}$/;
/** Submission keys for quote answers; contact fields never use this prefix. */
export const QUOTE_KEY_PREFIX = "qc_";

// ── parsing (stored / owner-supplied JSON -> safe pricing) ───────────────────

function str(v: unknown, max: number, fallback = ""): string {
  return typeof v === "string" ? v.trim().slice(0, max) : fallback;
}
function num(v: unknown, lo: number, hi: number, fallback: number): number {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
}
function cents(v: unknown): number {
  return Math.round(num(v, 0, MAX_PRICE_CENTS, 0));
}
function toId(label: string, taken: Set<string>): string {
  let base = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 32) || "input";
  if (!/^[a-z]/.test(base)) base = `i_${base}`;
  let id = base;
  for (let i = 2; taken.has(id); i++) id = `${base}_${i}`.slice(0, 40);
  return id;
}

function parseOptions(raw: unknown): QuoteOption[] {
  const out: QuoteOption[] = [];
  for (const o of Array.isArray(raw) ? raw.slice(0, MAX_OPTIONS) : []) {
    if (!o || typeof o !== "object") continue;
    const r = o as Record<string, unknown>;
    const label = str(r.label, 80);
    if (label) out.push({ label, priceCents: cents(r.priceCents) });
  }
  return out;
}

export function parseQuotePricing(raw: unknown): QuotePricing {
  const c = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const taken = new Set<string>();
  const inputs: QuoteInput[] = [];
  for (const item of Array.isArray(c.inputs) ? c.inputs.slice(0, MAX_QUOTE_INPUTS) : []) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const label = str(r.label, 80);
    if (!label) continue;
    const rawId = str(r.id, 40);
    const id = ID_RE.test(rawId) && !taken.has(rawId) ? rawId : toId(label, taken);
    taken.add(id);
    if (r.kind === "slider") {
      const min = num(r.min, 0, 1_000_000, 0);
      const max = num(r.max, min + 1, 1_000_000, Math.max(min + 1, 100));
      const step = num(r.step, 1, Math.max(1, max - min), 1);
      inputs.push({
        kind: "slider",
        id,
        label,
        min,
        max,
        step,
        default: snap(num(r.default, min, max, min), min, max, step),
        unit: str(r.unit, 20),
        included: num(r.included, 0, max, min),
        // Per-unit prices are often fractions of a cent ($0.044 / sq ft).
        pricePerUnitCents: Math.round(num(r.pricePerUnitCents, 0, MAX_PRICE_CENTS, 0) * 100) / 100,
      });
    } else if (r.kind === "counter") {
      const min = Math.round(num(r.min, 0, 100, 0));
      const max = Math.round(num(r.max, min + 1, 100, Math.max(min + 1, 10)));
      inputs.push({
        kind: "counter",
        id,
        label,
        min,
        max,
        default: Math.round(num(r.default, min, max, min)),
        pricePerUnitCents: cents(r.pricePerUnitCents),
      });
    } else if (r.kind === "choice" || r.kind === "addons") {
      const options = parseOptions(r.options);
      if (r.kind === "choice" ? options.length >= 2 : options.length >= 1) inputs.push({ kind: r.kind, id, label, options });
    }
  }

  let frequency: QuotePricing["frequency"] = null;
  if (c.frequency && typeof c.frequency === "object") {
    const f = c.frequency as Record<string, unknown>;
    const options: FrequencyOption[] = [];
    for (const o of Array.isArray(f.options) ? f.options.slice(0, 6) : []) {
      if (!o || typeof o !== "object") continue;
      const r = o as Record<string, unknown>;
      const label = str(r.label, 40);
      if (label) options.push({ label, discountPct: Math.round(num(r.discountPct, 0, 50, 0)) });
    }
    if (options.length >= 2) frequency = { label: str(f.label, 80, "How often?") || "How often?", options };
  }

  const round = num(c.roundToDollars, 1, 100, 5);
  return {
    basePriceCents: cents(c.basePriceCents),
    inputs,
    frequency,
    rangeLowPct: Math.round(num(c.rangeLowPct, 0, 50, 10)),
    rangeHighPct: Math.round(num(c.rangeHighPct, 0, 100, 10)),
    roundToDollars: (ROUND_TO as readonly number[]).includes(round) ? round : 5,
    minimumCents: cents(c.minimumCents),
    unitLabel: str(c.unitLabel, 30),
  };
}

// ── answers + estimate ──────────────────────────────────────────────────────

function snap(v: number, min: number, max: number, step: number): number {
  const s = Math.round((v - min) / step) * step + min;
  return Math.min(max, Math.max(min, Number(s.toFixed(4))));
}

export function defaultAnswers(p: QuotePricing): QuoteAnswers {
  const a: QuoteAnswers = {};
  for (const i of p.inputs) {
    if (i.kind === "slider" || i.kind === "counter") a[i.id] = i.default;
    else if (i.kind === "choice") a[i.id] = 0;
    else a[i.id] = [];
  }
  if (p.frequency) a.__frequency = 0;
  return a;
}

/** Clamp whatever a visitor sent to valid answers (unknown keys dropped, missing ones defaulted). */
export function normalizeAnswers(p: QuotePricing, raw: unknown): QuoteAnswers {
  const r = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const a = defaultAnswers(p);
  for (const i of p.inputs) {
    const v = r[i.id];
    if (i.kind === "slider") a[i.id] = snap(num(v, i.min, i.max, i.default), i.min, i.max, i.step);
    else if (i.kind === "counter") a[i.id] = Math.round(num(v, i.min, i.max, i.default));
    else if (i.kind === "choice") a[i.id] = Math.round(num(v, 0, i.options.length - 1, 0));
    else {
      const picked = Array.isArray(v) ? v : [];
      a[i.id] = [...new Set(picked.map((x) => Math.round(num(x, -1, 1e6, -1))).filter((x) => x >= 0 && x < i.options.length))].sort(
        (x, y) => x - y,
      );
    }
  }
  if (p.frequency) a.__frequency = Math.round(num(r.__frequency, 0, p.frequency.options.length - 1, 0));
  return a;
}

export function formatMoney(centsValue: number): string {
  const dollars = centsValue / 100;
  return dollars.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: Number.isInteger(dollars) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

export function computeEstimate(p: QuotePricing, answers: QuoteAnswers): Estimate {
  let subtotal = p.basePriceCents;
  for (const i of p.inputs) {
    const v = answers[i.id];
    if (i.kind === "slider" && typeof v === "number") subtotal += Math.max(0, v - i.included) * i.pricePerUnitCents;
    else if (i.kind === "counter" && typeof v === "number") subtotal += v * i.pricePerUnitCents;
    else if (i.kind === "choice" && typeof v === "number") subtotal += i.options[v]?.priceCents ?? 0;
    else if (i.kind === "addons" && Array.isArray(v)) for (const idx of v) subtotal += i.options[idx]?.priceCents ?? 0;
  }
  if (p.frequency) {
    const f = answers.__frequency;
    const pct = typeof f === "number" ? (p.frequency.options[f]?.discountPct ?? 0) : 0;
    subtotal = subtotal * (1 - pct / 100);
  }
  subtotal = Math.max(Math.round(subtotal), p.minimumCents);

  const step = p.roundToDollars * 100;
  const round = (c: number) => Math.max(0, Math.round(c / step) * step);
  let low = round(subtotal * (1 - p.rangeLowPct / 100));
  let high = round(subtotal * (1 + p.rangeHighPct / 100));
  if (p.minimumCents) low = Math.max(low, round(p.minimumCents));
  if (high < low) high = low;
  const range = low === high ? formatMoney(low) : `${formatMoney(low)} – ${formatMoney(high)}`;
  return { subtotalCents: subtotal, lowCents: low, highCents: high, text: p.unitLabel ? `${range} ${p.unitLabel}` : range };
}

// ── turning answers into submission values ──────────────────────────────────

/** Labels for the quote keys, in display order (dashboard, CSV, emails, webhook). */
export function quoteFieldDefs(p: QuotePricing): { id: string; label: string }[] {
  return [
    { id: `${QUOTE_KEY_PREFIX}estimate`, label: "Estimate" },
    ...p.inputs.map((i) => ({ id: `${QUOTE_KEY_PREFIX}${i.id}`, label: i.label })),
    ...(p.frequency ? [{ id: `${QUOTE_KEY_PREFIX}frequency`, label: p.frequency.label }] : []),
  ];
}

/** Human-readable answers keyed like quoteFieldDefs(), ready to store as submission data. */
export function quoteValues(p: QuotePricing, answers: QuoteAnswers, estimate: Estimate): Record<string, string> {
  const out: Record<string, string> = { [`${QUOTE_KEY_PREFIX}estimate`]: estimate.text };
  for (const i of p.inputs) {
    const v = answers[i.id];
    let text = "";
    if (i.kind === "slider" && typeof v === "number") text = `${v.toLocaleString("en-US")}${i.unit ? ` ${i.unit}` : ""}`;
    else if (i.kind === "counter" && typeof v === "number") text = String(v);
    else if (i.kind === "choice" && typeof v === "number") text = i.options[v]?.label ?? "";
    else if (i.kind === "addons" && Array.isArray(v)) text = v.map((idx) => i.options[idx]?.label).filter(Boolean).join(", ") || "None";
    out[`${QUOTE_KEY_PREFIX}${i.id}`] = text;
  }
  if (p.frequency) {
    const f = answers.__frequency;
    out[`${QUOTE_KEY_PREFIX}frequency`] = typeof f === "number" ? (p.frequency.options[f]?.label ?? "") : "";
  }
  return out;
}

/** A sensible starting point for a new calculator (home cleaning, like the preview page). */
export const DEFAULT_QUOTE: QuotePricing = {
  basePriceCents: 9000,
  inputs: [
    { kind: "slider", id: "home_size", label: "Home size", min: 500, max: 5000, step: 100, default: 1800, unit: "sq ft", included: 1000, pricePerUnitCents: 4.4 },
    { kind: "counter", id: "bedrooms", label: "Bedrooms", min: 0, max: 8, default: 3, pricePerUnitCents: 1200 },
    { kind: "counter", id: "bathrooms", label: "Bathrooms", min: 1, max: 8, default: 2, pricePerUnitCents: 1800 },
    {
      kind: "addons",
      id: "add_ons",
      label: "Add-ons",
      options: [
        { label: "Inside oven", priceCents: 3000 },
        { label: "Inside fridge", priceCents: 3000 },
        { label: "Interior windows", priceCents: 4500 },
      ],
    },
  ],
  frequency: {
    label: "How often?",
    options: [
      { label: "One-time", discountPct: 0 },
      { label: "Monthly", discountPct: 5 },
      { label: "Every 2 weeks", discountPct: 10 },
      { label: "Weekly", discountPct: 15 },
    ],
  },
  rangeLowPct: 8,
  rangeHighPct: 12,
  roundToDollars: 5,
  minimumCents: 0,
  unitLabel: "per visit",
};

/** Saved config for a quote module: the contact form plus its pricing. */
export function isQuoteModule(type: string): boolean {
  return type === "quote_calculator";
}
