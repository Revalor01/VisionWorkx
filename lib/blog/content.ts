import Anthropic from "@anthropic-ai/sdk";
import { logAiUsage } from "@/lib/aiUsage";
import type { ProductConfig } from "./products";

export interface GeneratedPost {
  title: string;
  slug: string;
  meta_description: string;
  excerpt: string;
  content: string;
  faqs: { question: string; answer: string }[];
  tags: string[];
}

const MIN_WORDS = 900;
const MAX_WORDS = 1200;

const SYSTEM_PROMPT = `You are an expert SEO content writer, writing for Revalor LLC's own products. Write like someone who genuinely built the thing, not a generic marketing account.

SEO requirements:
- Include the target keyword in: the H1 title, the first 100 words, at least 2 subheadings, and the conclusion
- Natural keyword density: 1-2% (do not stuff)
- Use ## and ### markdown headings to structure the post, at least 3 H2s
- End with a clear, soft call to action mentioning the product by name
- Write for humans first, search engines second — no generic filler

Output ONLY a valid JSON object, no markdown fences, no prose before or after. Structure:
{
  "title": "SEO-optimised H1 title, 50-60 characters, includes the keyword",
  "slug": "url-friendly-slug-from-title",
  "meta_description": "Compelling meta description, 150-160 characters, includes the keyword",
  "excerpt": "2-3 sentence excerpt summarising the post",
  "content": "Full blog post in markdown, ## for H2 and ### for H3, minimum ${MIN_WORDS} words",
  "faqs": [
    {"question": "...", "answer": "..."},
    {"question": "...", "answer": "..."},
    {"question": "...", "answer": "..."},
    {"question": "...", "answer": "..."},
    {"question": "...", "answer": "..."}
  ],
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"]
}`;

function extractJson(raw: string): Record<string, unknown> {
  let cleaned = raw.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error("Could not parse JSON from Claude's response");
  }
}

function countWords(text: string): number {
  return (text.match(/\w+/g) ?? []).length;
}

function makeSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function generateBlogPost(keyword: string, product: ProductConfig): Promise<GeneratedPost> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const userPrompt = `Product: ${product.name}
What it does: ${product.niche}
Audience: ${product.audience}
Tone: ${product.tone}
Target keyword: ${keyword}
Word count: ${MIN_WORDS}-${MAX_WORDS} words`;

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  await logAiUsage({
    source: "blog_content",
    model: "claude-sonnet-4-6",
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
  });

  const block = message.content[0];
  const text = block?.type === "text" ? block.text : "";
  if (!text) throw new Error("Content generation returned no text");

  const piece = extractJson(text);

  const required = ["title", "slug", "meta_description", "content", "faqs"];
  const missing = required.filter((f) => !piece[f]);
  if (missing.length > 0) {
    throw new Error(`Claude response missing fields: ${missing.join(", ")}`);
  }

  const title = String(piece.title);
  let slug = String(piece.slug ?? "");
  if (slug.length < 3) slug = makeSlug(title);

  const content = String(piece.content);
  const wordCount = countWords(content);
  if (wordCount < MIN_WORDS) {
    console.warn(`[blog/content] "${title}" is ${wordCount} words (target: ${MIN_WORDS}+)`);
  }

  return {
    title,
    slug,
    meta_description: String(piece.meta_description ?? ""),
    excerpt: String(piece.excerpt ?? ""),
    content,
    faqs: Array.isArray(piece.faqs)
      ? (piece.faqs as { question?: unknown; answer?: unknown }[]).map((f) => ({
          question: String(f.question ?? ""),
          answer: String(f.answer ?? ""),
        }))
      : [],
    tags: Array.isArray(piece.tags) ? (piece.tags as unknown[]).map((t) => String(t)) : [],
  };
}

export { countWords };
