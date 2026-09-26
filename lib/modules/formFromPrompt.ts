import Anthropic from "@anthropic-ai/sdk";
import { logAiUsage } from "@/lib/aiUsage";
import { DEFAULT_LEAD_FORM, FIELD_TYPES, parseFormConfig, type FormConfig } from "./config";

// Plain English -> a draft lead-capture form. Same approach as
// lib/apps/recommendBuild.ts (the /try recommender): Claude drafts, the owner
// reviews and edits before anything goes live. Structured outputs guarantee
// the JSON shape; parseFormConfig() then sanitises it like any stored config.

const MODEL = "claude-haiku-4-5";

const SYSTEM_PROMPT = `You design short, friendly lead-capture forms for US small businesses. The owner describes the form in plain English; you draft it.

Rules:
- Always include the customer's name and email. Add phone when the business would call back.
- Add only fields the description asks for or clearly implies. 3-8 fields total is typical; never more than 12.
- Field types: text (short answers, addresses), email, phone, select (a fixed list of choices, 2-8 options), textarea (longer descriptions), file (photos or PDFs the customer attaches).
- Use a file field only when the owner asks for photos, pictures, documents, or attachments.
- ids: short snake_case, unique, starting with a letter (e.g. "name", "email", "service_address", "photo").
- Labels: plain, friendly, sentence case, no jargon ("What do you need help with?", not "Service category").
- required: true for name, email, and anything the owner says they need; false for nice-to-haves.
- options: the choices for select fields; an empty list for every other type.
- title: the heading on the form ("Request a free quote"). intro: one short sentence setting expectations. submit_label: 2-4 words on the button. success_message: one or two sentences shown after sending.
- Write for the business's customers, in the business's voice.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "intro", "submit_label", "success_message", "fields"],
  properties: {
    title: { type: "string" },
    intro: { type: "string" },
    submit_label: { type: "string" },
    success_message: { type: "string" },
    fields: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "label", "type", "required", "options"],
        properties: {
          id: { type: "string" },
          label: { type: "string" },
          type: { type: "string", enum: [...FIELD_TYPES] },
          required: { type: "boolean" },
          options: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
} as const;

export interface DraftResult {
  config: FormConfig;
  fromAi: boolean;
}

export async function formFromPrompt(input: { description: string; businessName: string }): Promise<DraftResult> {
  const description = input.description.trim().slice(0, 800);
  if (!description) return { config: DEFAULT_LEAD_FORM, fromAi: false };

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  let message: Anthropic.Message;
  try {
    message = await client.messages.create({
      model: MODEL,
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Business: ${input.businessName.slice(0, 120)}\nThe form they want: ${description}`,
        },
      ],
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
    });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError || err instanceof Anthropic.InternalServerError) {
      console.warn("[formFromPrompt] Claude unavailable, using the default form:", err.status);
    } else if (err instanceof Anthropic.APIError) {
      console.error("[formFromPrompt] Claude API error:", err.status, err.message);
    } else {
      console.error("[formFromPrompt] request failed:", err instanceof Error ? err.message : err);
    }
    return { config: DEFAULT_LEAD_FORM, fromAi: false };
  }

  await logAiUsage({
    source: "module_config",
    model: MODEL,
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
  });

  if (message.stop_reason !== "end_turn") return { config: DEFAULT_LEAD_FORM, fromAi: false };
  const block = message.content.find((b): b is Anthropic.TextBlock => b.type === "text");
  if (!block) return { config: DEFAULT_LEAD_FORM, fromAi: false };

  try {
    const config = configFromDraft(JSON.parse(block.text) as RawDraft);
    return config.fields.length ? { config, fromAi: true } : { config: DEFAULT_LEAD_FORM, fromAi: false };
  } catch {
    return { config: DEFAULT_LEAD_FORM, fromAi: false };
  }
}

export interface RawDraft {
  title: string;
  intro: string;
  submit_label: string;
  success_message: string;
  fields: { id: string; label: string; type: string; required: boolean; options: string[] }[];
}

/** Model JSON -> a safe FormConfig (exported for tests). Always keeps a way to reply. */
export function configFromDraft(raw: RawDraft): FormConfig {
  const config = parseFormConfig({
    title: raw.title,
    intro: raw.intro,
    submitLabel: raw.submit_label,
    successMessage: raw.success_message,
    fields: (Array.isArray(raw.fields) ? raw.fields : []).slice(0, 12).map((f) => ({
      id: f.id,
      label: f.label,
      type: f.type,
      required: f.required,
      ...(f.type === "select" ? { options: f.options } : {}),
    })),
  });
  if (config.fields.length && !config.fields.some((f) => f.type === "email")) {
    config.fields.splice(Math.min(1, config.fields.length), 0, {
      id: config.fields.some((f) => f.id === "email") ? "email_address" : "email",
      label: "Email",
      type: "email",
      required: true,
      maxLength: 254,
    });
  }
  return config;
}
