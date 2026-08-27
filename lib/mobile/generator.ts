import Anthropic from "@anthropic-ai/sdk";
import { logAiUsage, type AiUsageSource } from "@/lib/aiUsage";
import { PUSH_TITLE_MAX, PUSH_BODY_MAX, SMS_BODY_MAX } from "@/lib/mobile/limits";

// Mirrors lib/marketing/emailGenerator.ts's shape (same model, same
// "regex a JSON blob out of the response" approach), tuned for short
// push/SMS copy with real length constraints instead of an email body.

export interface GeneratedPush {
  title: string;
  body: string;
}

export interface GeneratedSms {
  body: string;
}

async function generate(params: { productLabel: string; voiceNotes: string | null; goal: string; systemPrompt: string; source: AiUsageSource }): Promise<string> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const userPrompt = `Product: ${params.productLabel}
Voice notes: ${params.voiceNotes || "(none provided — use a confident, clear, founder-built tone)"}
What this message is about: ${params.goal}
Generate one message as a JSON object.`;

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 400,
    system: params.systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  await logAiUsage({
    source: params.source,
    model: "claude-sonnet-4-6",
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
  });

  const block = message.content[0];
  const text = block?.type === "text" ? block.text : "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Generation returned no parseable JSON");
  return jsonMatch[0];
}

const PUSH_SYSTEM_PROMPT = `You write push notification copy for Revalor LLC's own products, sent to people who already use the product.

Rules:
- title: <=${PUSH_TITLE_MAX} characters, no emoji spam, no clickbait.
- body: <=${PUSH_BODY_MAX} characters, one clear idea, one implicit call to action. No filler ("Exciting news!").
- Respect the brand voice notes provided exactly if given.

Output ONLY a JSON object, no prose, no markdown fences: { "title": string, "body": string }.`;

const SMS_SYSTEM_PROMPT = `You write SMS copy for Revalor LLC's own products, sent to people who already use the product and have opted in to texts.

Rules:
- body: <=${SMS_BODY_MAX} characters total (this is a hard SMS segment limit, not a suggestion) INCLUDING a trailing "Reply STOP to opt out." if there's room, otherwise keep the message itself shorter so that fits.
- One clear idea, one implicit call to action, plain text (no HTML, no markdown, no emoji spam).
- Respect the brand voice notes provided exactly if given.

Output ONLY a JSON object, no prose, no markdown fences: { "body": string }.`;

export async function generatePushCampaign(params: { productLabel: string; voiceNotes: string | null; goal: string }): Promise<GeneratedPush> {
  const json = await generate({ ...params, systemPrompt: PUSH_SYSTEM_PROMPT, source: "mobile_push" });
  const parsed = JSON.parse(json) as Partial<GeneratedPush>;
  if (!parsed.title || !parsed.body) throw new Error("Push generation returned an incomplete result");
  return { title: parsed.title.slice(0, PUSH_TITLE_MAX), body: parsed.body.slice(0, PUSH_BODY_MAX) };
}

export async function generateSmsCampaign(params: { productLabel: string; voiceNotes: string | null; goal: string }): Promise<GeneratedSms> {
  const json = await generate({ ...params, systemPrompt: SMS_SYSTEM_PROMPT, source: "mobile_sms" });
  const parsed = JSON.parse(json) as Partial<GeneratedSms>;
  if (!parsed.body) throw new Error("SMS generation returned an incomplete result");
  return { body: parsed.body.slice(0, SMS_BODY_MAX) };
}
