import Anthropic from "@anthropic-ai/sdk";
import { logAiUsage } from "@/lib/aiUsage";
import { PRODUCT_KNOWLEDGE } from "@/lib/social/productKnowledge";
import type { SocialVideoProduct } from "@/lib/database.types";

// Powers Media Studio's "Suggest content" button — grounds a short video
// subject/scene description in the selected product's real marketing copy
// (lib/social/productKnowledge.ts) instead of the admin writing every
// prompt from scratch. Mirrors contentGenerator.ts's Anthropic call
// pattern (same model, same logAiUsage tag convention).
const SYSTEM_PROMPT = `You write short, concrete visual scene descriptions for a text-to-video AI model promoting a Revalor software product. You're given a real product description and asked for ONE fresh variation.

Rules:
- Describe a SCENE or SUBJECT the video could show — a person, an action, a moment — not marketing copy or a caption
- Ground it in the specific feature or benefit given, not a generic "someone using an app" description
- 1-2 sentences, under 220 characters
- No hashtags, no emoji, no "Check this out" filler
- Never describe on-screen text, words, or letters — text isn't rendered in the video
- Output ONLY the scene description, no prose, no markdown, no quotes around it`;

export async function generateStudioSubject(product: SocialVideoProduct): Promise<string> {
  const knowledge = PRODUCT_KNOWLEDGE[product];
  if (!knowledge) {
    throw new Error("No product knowledge available for a company-wide (non-specific) video — write the prompt directly instead.");
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const userPrompt = `Product: ${knowledge.name}
Tagline: ${knowledge.tagline}
What it does: ${knowledge.whatItDoes}
Features: ${knowledge.features.join("; ")}
Target audience: ${knowledge.targetAudience}

Give one fresh video scene idea for this product.`;

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 200,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  await logAiUsage({
    source: "social_studio_subject",
    model: "claude-sonnet-4-6",
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
  });

  const block = message.content[0];
  const text = block?.type === "text" ? block.text.trim() : "";
  if (!text) throw new Error("Subject suggestion returned no text");

  return text;
}
