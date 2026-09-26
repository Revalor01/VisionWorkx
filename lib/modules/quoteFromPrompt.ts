import Anthropic from "@anthropic-ai/sdk";
import { logAiUsage } from "@/lib/aiUsage";
import { FIELD_TYPES, parseFormConfig } from "./config";
import { parseQuotePricing } from "./quote";
import { DEFAULT_QUOTE_CONFIG, type QuoteDraftConfig } from "./moduleConfig";

export { DEFAULT_QUOTE_CONFIG };

// Plain English pricing -> a draft quote calculator. Same approach as
// formFromPrompt: Claude drafts with a guaranteed JSON shape, then the result
// is sanitised exactly like a config the owner saved, and the owner reviews
// every price before anything goes live.

const MODEL = "claude-haiku-4-5";

const SYSTEM_PROMPT = `You set up instant price-estimate calculators for US small businesses. The owner describes how they price their work; you turn it into a calculator their website visitors use to get an estimate range, then send their details for an exact quote.

Pricing model:
- base_price: the starting price in US dollars before any options.
- minimum_price: the smallest job they'll quote, in dollars (e.g. "$35 minimum" -> 35), or 0 if none.
- inputs (1-6, in the order a visitor would think about them), each one of:
  - slider: a size or quantity on a scale (square feet, hours, linear feet). Set min, max, step, default, unit (e.g. "sq ft"), included (units covered by the base price) and price_per_unit (dollars per unit above included; can be a fraction like 0.04).
  - counter: a small whole number (bedrooms, windows, pets). Set min, max, default and price_per_unit (dollars each).
  - choice: pick exactly one (service level, material). 2-6 options, each with its price in dollars (0 allowed).
  - addons: tick any (extras). 1-8 options, each with its price in dollars.
  For fields that don't apply to a kind, use 0, an empty string or an empty list.
- frequency_options: only for recurring services (cleaning, lawn care, pool care): 2-4 options like "One-time" (0) and "Weekly" with a discount_pct (0-30). Otherwise an empty list.
- range_low_pct and range_high_pct: how far below/above the calculated price the estimate range reaches (typically 5-15 each; wider when the owner says jobs vary a lot).
- unit_label: what the price is for, lowercase ("per visit", "per project", "per month"), or "" if unclear.
Use the owner's own numbers. When they don't give a number, pick a reasonable US market price and keep it simple.

Contact questions (contact_fields): always name and email; add phone and a location field (ZIP or address) when the business travels to the customer. 2-5 fields. ids short snake_case starting with a letter; types text, email, phone, select, textarea; plain sentence-case labels without "(optional)"; options only for select.

Words: title (heading, e.g. "Instant cleaning estimate"), intro (one short sentence), submit_label (2-5 words, e.g. "Send me the exact quote"), success_message (one or two sentences). Write for the business's customers, in the business's voice.`;

const OPTION = {
  type: "object",
  additionalProperties: false,
  required: ["label", "price"],
  properties: { label: { type: "string" }, price: { type: "number" } },
} as const;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "intro",
    "submit_label",
    "success_message",
    "unit_label",
    "base_price",
    "minimum_price",
    "inputs",
    "frequency_options",
    "range_low_pct",
    "range_high_pct",
    "contact_fields",
  ],
  properties: {
    title: { type: "string" },
    intro: { type: "string" },
    submit_label: { type: "string" },
    success_message: { type: "string" },
    unit_label: { type: "string" },
    base_price: { type: "number" },
    minimum_price: { type: "number" },
    inputs: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "label", "unit", "min", "max", "step", "default", "included", "price_per_unit", "options"],
        properties: {
          kind: { type: "string", enum: ["slider", "counter", "choice", "addons"] },
          label: { type: "string" },
          unit: { type: "string" },
          min: { type: "number" },
          max: { type: "number" },
          step: { type: "number" },
          default: { type: "number" },
          included: { type: "number" },
          price_per_unit: { type: "number" },
          options: { type: "array", items: OPTION },
        },
      },
    },
    frequency_options: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "discount_pct"],
        properties: { label: { type: "string" }, discount_pct: { type: "number" } },
      },
    },
    range_low_pct: { type: "number" },
    range_high_pct: { type: "number" },
    contact_fields: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "label", "type", "required", "options"],
        properties: {
          id: { type: "string" },
          label: { type: "string" },
          type: { type: "string", enum: FIELD_TYPES.filter((t) => t !== "file") },
          required: { type: "boolean" },
          options: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
} as const;

export interface RawQuoteDraft {
  title: string;
  intro: string;
  submit_label: string;
  success_message: string;
  unit_label: string;
  base_price: number;
  minimum_price: number;
  inputs: {
    kind: string;
    label: string;
    unit: string;
    min: number;
    max: number;
    step: number;
    default: number;
    included: number;
    price_per_unit: number;
    options: { label: string; price: number }[];
  }[];
  frequency_options: { label: string; discount_pct: number }[];
  range_low_pct: number;
  range_high_pct: number;
  contact_fields: { id: string; label: string; type: string; required: boolean; options: string[] }[];
}


/** Model JSON -> a safe config (exported for tests). Dollars become cents here. */
export function quoteConfigFromDraft(raw: RawQuoteDraft): QuoteDraftConfig {
  const dollarsToCents = (d: unknown) => (typeof d === "number" && Number.isFinite(d) ? d * 100 : 0);
  const form = parseFormConfig({
    title: raw.title,
    intro: raw.intro,
    submitLabel: raw.submit_label,
    successMessage: raw.success_message,
    fields: (Array.isArray(raw.contact_fields) ? raw.contact_fields : []).slice(0, 6).map((f) => ({
      id: f.id,
      label: typeof f.label === "string" ? f.label.replace(/\s*\((optional|required)\)\s*$/i, "") : f.label,
      type: f.type,
      required: f.required,
      ...(f.type === "select" ? { options: f.options } : {}),
    })),
  });
  if (!form.fields.some((f) => f.type === "email")) {
    form.fields.push({ id: form.fields.some((f) => f.id === "email") ? "email_address" : "email", label: "Email", type: "email", required: true, maxLength: 254 });
  }
  const quote = parseQuotePricing({
    basePriceCents: dollarsToCents(raw.base_price),
    minimumCents: dollarsToCents(raw.minimum_price),
    inputs: (Array.isArray(raw.inputs) ? raw.inputs : []).map((i) => ({
      kind: i.kind,
      label: i.label,
      unit: i.unit,
      min: i.min,
      max: i.max,
      step: i.step,
      default: i.default,
      included: i.included,
      pricePerUnitCents: dollarsToCents(i.price_per_unit),
      options: (Array.isArray(i.options) ? i.options : []).map((o) => ({ label: o.label, priceCents: dollarsToCents(o.price) })),
    })),
    frequency:
      Array.isArray(raw.frequency_options) && raw.frequency_options.length >= 2
        ? { label: "How often?", options: raw.frequency_options.map((o) => ({ label: o.label, discountPct: o.discount_pct })) }
        : null,
    rangeLowPct: raw.range_low_pct,
    rangeHighPct: raw.range_high_pct,
    roundToDollars: 5,
    unitLabel: raw.unit_label,
  });
  return { ...form, payment: null, quote };
}

export async function quoteFromPrompt(input: { description: string; businessName: string }): Promise<{ config: QuoteDraftConfig; fromAi: boolean }> {
  const description = input.description.trim().slice(0, 800);
  const fallback = { config: DEFAULT_QUOTE_CONFIG, fromAi: false };
  if (!description) return fallback;

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  let message: Anthropic.Message;
  try {
    message = await client.messages.create({
      model: MODEL,
      max_tokens: 3000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: `Business: ${input.businessName.slice(0, 120)}\nHow they price their work: ${description}` }],
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
    });
  } catch (err) {
    if (err instanceof Anthropic.APIError) console.error("[quoteFromPrompt] Claude API error:", err.status, err.message);
    else console.error("[quoteFromPrompt] request failed:", err instanceof Error ? err.message : err);
    return fallback;
  }

  await logAiUsage({
    source: "module_config",
    model: MODEL,
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
  });

  if (message.stop_reason !== "end_turn") return fallback;
  const block = message.content.find((b): b is Anthropic.TextBlock => b.type === "text");
  if (!block) return fallback;
  try {
    const config = quoteConfigFromDraft(JSON.parse(block.text) as RawQuoteDraft);
    return config.quote.inputs.length ? { config, fromAi: true } : fallback;
  } catch {
    return fallback;
  }
}
