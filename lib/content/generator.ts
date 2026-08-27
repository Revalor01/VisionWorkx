import Anthropic from "@anthropic-ai/sdk";
import { logAiUsage } from "@/lib/aiUsage";

export interface GeneratedSource {
  title: string;
  body: string;
}

const SYSTEM_PROMPT = `You draft the source write-up for Revalor LLC's content engine — one piece of real substance (a product update, an announcement, a short feature writeup) that other prompts will later repurpose into a blog post, social captions, an email, and a push/SMS one-liner. Write like a founder describing something they actually built.

Rules:
- title: a clear, specific headline for this piece (<=100 chars)
- body: 150-300 words, plain text (no markdown headers), enough real substance that a derivative generator has something concrete to work from — not a vague teaser
- Be specific about what changed or what this is about — no generic filler

Output ONLY a JSON object, no prose, no markdown fences: { "title": string, "body": string }.`;

// Feeds a content_items row when a content_topics entry fires on its own
// schedule — the admin's on-demand "create a source item" flow in the
// Content UI writes the title/body directly instead of calling this.
export async function generateSourceDraft(params: { productLabel: string; topic: string; keywordCluster: string[] }): Promise<GeneratedSource> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const userPrompt = `Product: ${params.productLabel}
Topic: ${params.topic}
${params.keywordCluster.length > 0 ? `Keyword cluster to ground this in: ${params.keywordCluster.join(", ")}\n` : ""}Generate the source write-up as a JSON object.`;

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 800,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  await logAiUsage({
    source: "content_engine_source",
    model: "claude-sonnet-4-6",
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
  });

  const block = message.content[0];
  const text = block?.type === "text" ? block.text : "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Source generation returned no parseable JSON");

  const parsed = JSON.parse(jsonMatch[0]) as Partial<GeneratedSource>;
  if (!parsed.title || !parsed.body) throw new Error("Source generation returned an incomplete result");

  return { title: String(parsed.title).slice(0, 200), body: String(parsed.body) };
}
