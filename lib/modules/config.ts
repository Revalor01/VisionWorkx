// Module config + submission validation. Shared by the iframe renderer, the
// shadow-DOM config endpoint and the submissions API, so what a visitor sees
// and what the server accepts can never drift apart.
//
// A4 ships the generic form shape used by lead capture and intake forms.
// Booking / quote modules (A7) add their own config types on top.

export const FIELD_TYPES = ["text", "email", "phone", "select", "textarea"] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export interface FieldDef {
  id: string; // stable key used in submission data
  label: string;
  type: FieldType;
  required: boolean;
  options?: string[]; // select only
  placeholder?: string;
  maxLength: number;
}

export interface FormConfig {
  title: string;
  intro: string;
  submitLabel: string;
  successMessage: string;
  redirectUrl: string | null;
  fields: FieldDef[];
}

export interface Brand {
  color: string;
  font: "modern" | "classic" | "friendly";
  radius: number;
}

const DEFAULT_MAX: Record<FieldType, number> = { text: 200, email: 254, phone: 40, select: 200, textarea: 4000 };
const ID_RE = /^[a-z][a-z0-9_]{0,39}$/;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function str(v: unknown, max: number, fallback = ""): string {
  return typeof v === "string" ? v.trim().slice(0, max) : fallback;
}

/** Turn stored JSON into a safe, complete FormConfig (drops anything invalid). */
export function parseFormConfig(raw: unknown): FormConfig {
  const c = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const seen = new Set<string>();
  const fields: FieldDef[] = [];
  for (const f of Array.isArray(c.fields) ? c.fields.slice(0, 30) : []) {
    if (!f || typeof f !== "object") continue;
    const o = f as Record<string, unknown>;
    const id = str(o.id, 40);
    const type = FIELD_TYPES.includes(o.type as FieldType) ? (o.type as FieldType) : null;
    if (!ID_RE.test(id) || !type || seen.has(id)) continue;
    seen.add(id);
    const options =
      type === "select"
        ? (Array.isArray(o.options) ? o.options : [])
            .map((x) => str(x, 200))
            .filter(Boolean)
            .slice(0, 50)
        : undefined;
    if (type === "select" && (!options || options.length === 0)) continue;
    const maxLength = Math.min(
      DEFAULT_MAX[type],
      typeof o.maxLength === "number" && o.maxLength > 0 ? Math.floor(o.maxLength) : DEFAULT_MAX[type],
    );
    fields.push({
      id,
      label: str(o.label, 120) || id,
      type,
      required: o.required === true,
      ...(options ? { options } : {}),
      ...(typeof o.placeholder === "string" && o.placeholder.trim() ? { placeholder: str(o.placeholder, 120) } : {}),
      maxLength,
    });
  }
  const redirect = str(c.redirectUrl, 500);
  return {
    title: str(c.title, 120),
    intro: str(c.intro, 500),
    submitLabel: str(c.submitLabel, 40) || "Send",
    successMessage: str(c.successMessage, 500) || "Thanks — we've got it and will be in touch soon.",
    redirectUrl: /^https:\/\/[^\s]+$/.test(redirect) ? redirect : null,
    fields,
  };
}

export function parseBrand(raw: unknown): Brand {
  const b = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const font = ["modern", "classic", "friendly"].includes(b.font as string) ? (b.font as Brand["font"]) : "modern";
  const radius = typeof b.radius === "number" ? Math.max(0, Math.min(24, Math.round(b.radius))) : 10;
  return { color: typeof b.color === "string" && HEX_RE.test(b.color) ? b.color : "#1b2542", font, radius };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[0-9+().\-\s]{7,40}$/;

export type ValidationResult =
  | { ok: true; values: Record<string, string> }
  | { ok: false; errors: Record<string, string> };

/** Validate visitor input against the config. Unknown keys are ignored. */
export function validateSubmission(config: FormConfig, input: unknown): ValidationResult {
  const data = (input && typeof input === "object" && !Array.isArray(input) ? input : {}) as Record<string, unknown>;
  const values: Record<string, string> = {};
  const errors: Record<string, string> = {};
  for (const f of config.fields) {
    const raw = data[f.id];
    const v = typeof raw === "string" ? raw.trim() : "";
    if (!v) {
      if (f.required) errors[f.id] = `${f.label} is required.`;
      continue;
    }
    if (v.length > f.maxLength) {
      errors[f.id] = `${f.label} must be ${f.maxLength} characters or fewer.`;
      continue;
    }
    if (f.type === "email" && !EMAIL_RE.test(v)) errors[f.id] = "Enter a valid email address.";
    else if (f.type === "phone" && !PHONE_RE.test(v)) errors[f.id] = "Enter a valid phone number.";
    else if (f.type === "select" && !(f.options ?? []).includes(v)) errors[f.id] = `Choose one of the ${f.label} options.`;
    else values[f.id] = f.type === "email" ? v.toLowerCase() : v;
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, values };
}

/** A sensible starter config for a new lead-capture module. */
export const DEFAULT_LEAD_FORM: FormConfig = {
  title: "Request a free quote",
  intro: "Tell us what you need and we'll get back to you within one business day.",
  submitLabel: "Send my request",
  successMessage: "Thanks — we've got your request and will be in touch soon.",
  redirectUrl: null,
  fields: [
    { id: "name", label: "Full name", type: "text", required: true, maxLength: 120 },
    { id: "email", label: "Email", type: "email", required: true, maxLength: 254 },
    { id: "phone", label: "Phone", type: "phone", required: false, maxLength: 40 },
    { id: "message", label: "How can we help?", type: "textarea", required: false, maxLength: 4000 },
  ],
};
