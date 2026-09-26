import { parseFormConfig, type FormConfig } from "./config";
import { DEFAULT_QUOTE, isQuoteModule, parseQuotePricing, QUOTE_KEY_PREFIX, type QuotePricing } from "./quote";

// Browser-safe: used by the owner builder as well as the server.

export const CREATABLE_TYPES = ["lead_capture", "quote_calculator"] as const;
export type CreatableType = (typeof CREATABLE_TYPES)[number];

export type StoredConfig = FormConfig & { quote?: QuotePricing };

/**
 * Sanitise an owner-supplied config for a module type before it's stored.
 * Quote calculators keep their pricing under `quote`; their contact questions
 * are ordinary form fields (no payment-on-submit for calculators).
 */
export function buildStoredConfig(type: string, raw: unknown): { config: StoredConfig } | { error: string } {
  const form = parseFormConfig(raw);
  if (!isQuoteModule(type)) {
    if (form.fields.length === 0) return { error: "Add at least one field." };
    return { config: form };
  }
  const quote = parseQuotePricing((raw as { quote?: unknown } | null)?.quote);
  if (quote.inputs.length === 0) return { error: "Add at least one priced option to your calculator." };
  // Contact questions can't use the prefix reserved for quote answers.
  const fields = form.fields.map((f) => (f.id.startsWith(QUOTE_KEY_PREFIX) ? { ...f, id: `c_${f.id}`.slice(0, 40) } : f));
  if (!fields.some((f) => f.type === "email" || f.type === "phone")) {
    return { error: "Ask for an email or phone number so you can send the exact quote." };
  }
  return { config: { ...form, fields, payment: null, quote } };
}

export type QuoteDraftConfig = FormConfig & { quote: QuotePricing };

/** Starting point for "start from an example calculator" and the AI-draft fallback. */
export const DEFAULT_QUOTE_CONFIG: QuoteDraftConfig = {
  ...parseFormConfig({
    title: "Instant estimate",
    intro: "Pick what you need to see a price range right away.",
    submitLabel: "Send me the exact quote",
    successMessage: "Thanks! We'll confirm your exact quote shortly.",
    fields: [
      { id: "name", label: "Your name", type: "text", required: true },
      { id: "email", label: "Email", type: "email", required: true },
      { id: "phone", label: "Phone", type: "phone", required: false },
      { id: "zip", label: "ZIP code", type: "text", required: false },
    ],
  }),
  quote: DEFAULT_QUOTE,
};
