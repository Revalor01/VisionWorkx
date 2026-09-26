import { parseFormConfig, type FormConfig } from "./config";
import { DEFAULT_QUOTE, isQuoteModule, parseQuotePricing, QUOTE_KEY_PREFIX, type QuotePricing } from "./quote";
import { BOOKING_KEY_PREFIX, DEFAULT_BOOKING, isBookingModule, parseBookingSetup, type BookingSetup } from "./booking";

// Browser-safe: used by the owner builder as well as the server.

export const CREATABLE_TYPES = ["lead_capture", "quote_calculator", "booking"] as const;
export type CreatableType = (typeof CREATABLE_TYPES)[number];

export type StoredConfig = FormConfig & { quote?: QuotePricing; booking?: BookingSetup };

/**
 * Sanitise an owner-supplied config for a module type before it's stored.
 * Quote calculators keep their pricing under `quote`; their contact questions
 * are ordinary form fields (no payment-on-submit for calculators).
 */
export function buildStoredConfig(type: string, raw: unknown, workspaceTimeZone = "America/New_York"): { config: StoredConfig } | { error: string } {
  const form = parseFormConfig(raw);
  if (isBookingModule(type)) {
    const booking = parseBookingSetup((raw as { booking?: unknown } | null)?.booking, workspaceTimeZone);
    if (booking.services.length === 0) return { error: "Add at least one service people can book." };
    if (!booking.weekly.some((w) => w.length > 0)) return { error: "Set the hours you're available on at least one day." };
    const fields = form.fields.map((f) => (f.id.startsWith(BOOKING_KEY_PREFIX) ? { ...f, id: `c_${f.id}`.slice(0, 40) } : f));
    if (!fields.some((f) => f.type === "email")) return { error: "Ask for an email so customers get their confirmation and reminder." };
    // A deposit on booking is allowed (Connect payments); nothing else to strip.
    return { config: { ...form, fields, booking } };
  }
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

export type BookingDraftConfig = FormConfig & { booking: BookingSetup };

/** Starting point for a new booking module. */
export function defaultBookingConfig(timeZone: string): BookingDraftConfig {
  return {
    ...parseFormConfig({
      title: "Book an appointment",
      intro: "Pick a service and a time that works for you.",
      submitLabel: "Confirm booking",
      successMessage: "You're booked! We've emailed your confirmation.",
      fields: [
        { id: "name", label: "Your name", type: "text", required: true },
        { id: "email", label: "Email", type: "email", required: true },
        { id: "phone", label: "Phone", type: "phone", required: false },
        { id: "notes", label: "Anything we should know?", type: "textarea", required: false },
      ],
    }),
    booking: { ...DEFAULT_BOOKING, timeZone },
  };
}
