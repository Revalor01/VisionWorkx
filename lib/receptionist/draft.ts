import Anthropic from "@anthropic-ai/sdk";
import { logAiUsage } from "@/lib/aiUsage";
import { defaultReceptionistConfig, parseReceptionistConfig, RECEPTIONIST_TONES, type ReceptionistConfig } from "./config";

// Plain English -> a draft receptionist setup. Same approach as
// lib/modules/formFromPrompt.ts: Claude drafts with structured outputs, the
// owner reviews and edits every word before anything goes live, and the
// result is sanitised by the same parser as stored configs.

const MODEL = "claude-haiku-4-5";

const SYSTEM_PROMPT = `You set up an AI receptionist for a US small business. The owner describes their business in plain English; you turn it into the facts the receptionist answers from.

Rules:
- Use ONLY what the owner wrote. Never invent prices, hours, addresses, policies or services. Leave a field as an empty string when the owner didn't mention it.
- about: two or three sentences on what the business does and who it serves.
- services: one line per service, with the price exactly as the owner gave it (or no price if they didn't).
- hours and location: copy what the owner said, tidied up.
- faq: 3-8 questions customers would really ask, answered only from the owner's description. Skip any you can't answer from it.
- greeting: one short, friendly opening line naming the business.
- follow_up: one sentence promising a reply, e.g. "Someone from our team will call you back within one business day." Only mention a time frame if the owner did.
- title: 2-5 words for the chat header ("Questions? Ask us"). intro: one short sentence under it.
- tone: friendly, professional or casual, matching how the owner writes.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "intro", "greeting", "about", "services", "hours", "location", "faq", "follow_up", "tone"],
  properties: {
    title: { type: "string" },
    intro: { type: "string" },
    greeting: { type: "string" },
    about: { type: "string" },
    services: { type: "string" },
    hours: { type: "string" },
    location: { type: "string" },
    faq: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["q", "a"],
        properties: { q: { type: "string" }, a: { type: "string" } },
      },
    },
    follow_up: { type: "string" },
    tone: { type: "string", enum: [...RECEPTIONIST_TONES] },
  },
} as const;

export interface RawReceptionistDraft {
  title: string;
  intro: string;
  greeting: string;
  about: string;
  services: string;
  hours: string;
  location: string;
  faq: { q: string; a: string }[];
  follow_up: string;
  tone: string;
}

/** Model JSON -> a safe config (exported for tests). */
export function configFromReceptionistDraft(raw: RawReceptionistDraft): ReceptionistConfig {
  return parseReceptionistConfig({
    title: raw.title,
    intro: raw.intro,
    receptionist: {
      greeting: raw.greeting,
      about: raw.about,
      services: raw.services,
      hours: raw.hours,
      location: raw.location,
      faq: raw.faq,
      followUp: raw.follow_up,
      tone: raw.tone,
    },
  });
}

export async function receptionistFromPrompt(input: { description: string; businessName: string }): Promise<{ config: ReceptionistConfig; fromAi: boolean }> {
  const description = input.description.trim().slice(0, 2000);
  const fallback = defaultReceptionistConfig();
  if (!description) return { config: fallback, fromAi: false };

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  let message: Anthropic.Message;
  try {
    message = await client.messages.create({
      model: MODEL,
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: `Business: ${input.businessName.slice(0, 120)}\nAbout the business: ${description}` }],
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
    });
  } catch (err) {
    console.error("[receptionistFromPrompt] Claude request failed:", err instanceof Anthropic.APIError ? err.status : err instanceof Error ? err.message : err);
    return { config: fallback, fromAi: false };
  }

  await logAiUsage({ source: "receptionist_setup", model: MODEL, inputTokens: message.usage.input_tokens, outputTokens: message.usage.output_tokens });

  if (message.stop_reason !== "end_turn") return { config: fallback, fromAi: false };
  const block = message.content.find((b): b is Anthropic.TextBlock => b.type === "text");
  if (!block) return { config: fallback, fromAi: false };
  try {
    const config = configFromReceptionistDraft(JSON.parse(block.text) as RawReceptionistDraft);
    return config.receptionist.about ? { config, fromAi: true } : { config: fallback, fromAi: false };
  } catch {
    return { config: fallback, fromAi: false };
  }
}
