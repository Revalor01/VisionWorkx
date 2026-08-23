import Anthropic from "@anthropic-ai/sdk";
import { logAiUsage } from "@/lib/aiUsage";

export interface GeneratedEmail {
  subject: string;
  bodyHtml: string;
}

// Mirrors lib/social/contentGenerator.ts's shape (same model, same
// "regex a JSON blob out of the response" approach) — tuned for a single
// marketing email instead of a batch of social posts.
const SYSTEM_PROMPT = `You write marketing emails for Revalor LLC's own products, sent to people who already use the product. Write like a founder giving a real update, not a generic marketing blast.

Rules:
- subject: short, specific, no clickbait, no emoji spam (<=60 chars)
- bodyHtml: the full email body as simple HTML (a few <p> tags, maybe one <strong> — no <html>/<body> wrapper, no inline styles, no images). Plain and direct, like an email from someone who actually built the thing.
- No generic filler ("Exciting news!", "We're thrilled to announce"). Be specific about what changed or why this email exists.
- Do not include an unsubscribe link or footer — that gets appended automatically.
- Respect the brand voice notes provided exactly if given.

Output ONLY a JSON object, no prose, no markdown fences: { "subject": string, "bodyHtml": string }.`;

export async function generateEmailCampaign(params: {
  productLabel: string;
  voiceNotes: string | null;
  goal: string;
}): Promise<GeneratedEmail> {
  const { productLabel, voiceNotes, goal } = params;

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const userPrompt = `Product: ${productLabel}
Voice notes: ${voiceNotes || "(none provided — use a confident, clear, founder-built tone)"}
What this email is about: ${goal}
Generate one email as a JSON object.`;

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1200,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  await logAiUsage({
    source: "marketing_email",
    model: "claude-sonnet-4-6",
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
  });

  const block = message.content[0];
  const text = block?.type === "text" ? block.text : "";

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Email generation returned no parseable JSON");

  const parsed = JSON.parse(jsonMatch[0]) as Partial<GeneratedEmail>;
  if (!parsed.subject || !parsed.bodyHtml) {
    throw new Error("Email generation returned an incomplete result");
  }

  return {
    subject: String(parsed.subject).slice(0, 120),
    bodyHtml: String(parsed.bodyHtml),
  };
}
