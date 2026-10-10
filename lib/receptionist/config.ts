import { parseFormConfig, type FieldDef, type FormConfig } from "@/lib/modules/config";

// AI receptionist module config (browser-safe). Stored like the other module
// types: an ordinary FormConfig (title/intro are the chat header; `fields` are
// the fixed lead fields so submissions, the owner board, CSV export and the
// automation emails all label them correctly) plus `receptionist` — the facts
// the AI answers from. Everything the AI says comes from this object.

export const RECEPTIONIST_TONES = ["friendly", "professional", "casual"] as const;
export type ReceptionistTone = (typeof RECEPTIONIST_TONES)[number];

export interface FaqItem {
  q: string;
  a: string;
}

export interface ReceptionistSetup {
  /** First thing the receptionist says (chat bubble opener / phone greeting). */
  greeting: string;
  /** What the business does, in the owner's words. */
  about: string;
  /** Services and prices exactly as the owner wants them quoted. Empty = never quote prices. */
  services: string;
  hours: string;
  location: string;
  faq: FaqItem[];
  tone: ReceptionistTone;
  /** What to promise when it can't help ("Someone will call you back within one business day."). */
  followUp: string;
  /** public_id of a booking module in the same workspace; null = take messages only. */
  bookingModuleId: string | null;
  /** E.164 US number calls can be transferred to (voice only); null = never transfer. */
  transferPhone: string | null;
}

/** Lead fields stored on every receptionist submission (ids never change — past submissions use them). */
export const RECEPTIONIST_FIELDS: FieldDef[] = [
  { id: "name", label: "Name", type: "text", required: true, maxLength: 120 },
  { id: "email", label: "Email", type: "email", required: false, maxLength: 254 },
  { id: "phone", label: "Phone", type: "phone", required: false, maxLength: 40 },
  { id: "message", label: "What they need", type: "textarea", required: true, maxLength: 4000 },
  { id: "channel", label: "Came in by", type: "text", required: false, maxLength: 40 },
];

export type ReceptionistConfig = FormConfig & { receptionist: ReceptionistSetup };

const PUBLIC_ID_RE = /^m_[0-9a-f]{18}$/;
const E164_US = /^\+1[2-9][0-9]{9}$/;

export function isReceptionistModule(type: string): boolean {
  return type === "receptionist";
}

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

/** "(555) 123-4567", "555.123.4567", "+1 555 123 4567" -> "+15551234567"; null if it isn't a US number. */
export function toE164(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let digits = raw.replace(/\D/g, "");
  if (digits.length === 10) digits = `1${digits}`;
  const e164 = `+${digits}`;
  return E164_US.test(e164) ? e164 : null;
}

/** Stored JSON -> a safe, complete setup (drops anything invalid). */
export function parseReceptionistSetup(raw: unknown): ReceptionistSetup {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const faq: FaqItem[] = [];
  for (const f of Array.isArray(r.faq) ? r.faq.slice(0, 20) : []) {
    if (!f || typeof f !== "object") continue;
    const q = str((f as Record<string, unknown>).q, 200);
    const a = str((f as Record<string, unknown>).a, 800);
    if (q && a) faq.push({ q, a });
  }
  const bookingModuleId = str(r.bookingModuleId, 40);
  return {
    greeting: str(r.greeting, 300) || "Hi! How can I help you today?",
    about: str(r.about, 2000),
    services: str(r.services, 2000),
    hours: str(r.hours, 500),
    location: str(r.location, 300),
    faq,
    tone: RECEPTIONIST_TONES.includes(r.tone as ReceptionistTone) ? (r.tone as ReceptionistTone) : "friendly",
    followUp: str(r.followUp, 300) || "Someone from our team will get back to you soon.",
    bookingModuleId: PUBLIC_ID_RE.test(bookingModuleId) ? bookingModuleId : null,
    transferPhone: toE164(r.transferPhone),
  };
}

/** Full stored config: fixed lead fields, no payment, header text from the owner. */
export function parseReceptionistConfig(raw: unknown): ReceptionistConfig {
  const form = parseFormConfig(raw);
  return {
    ...form,
    title: form.title || "Ask us anything",
    intro: form.intro || "Our AI assistant can answer questions and take a message.",
    fields: RECEPTIONIST_FIELDS,
    payment: null,
    receptionist: parseReceptionistSetup((raw as { receptionist?: unknown } | null)?.receptionist),
  };
}

/** Owner-side check before saving: enough facts for the AI to be useful. */
export function receptionistConfigError(c: ReceptionistConfig): string | null {
  if (c.receptionist.about.length < 20) return "Tell the receptionist what your business does (a sentence or two).";
  return null;
}

export function defaultReceptionistConfig(): ReceptionistConfig {
  return parseReceptionistConfig({
    title: "Ask us anything",
    intro: "Our AI assistant can answer questions, book appointments and take a message.",
    receptionist: { tone: "friendly" },
  });
}
