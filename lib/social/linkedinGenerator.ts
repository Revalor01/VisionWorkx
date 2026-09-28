import Anthropic from "@anthropic-ai/sdk";
import { logAiUsage } from "@/lib/aiUsage";
import { extractJson } from "@/lib/social/extractJson";
import type { LinkedInProduct } from "@/lib/database.types";
import { formatProductKnowledge } from "@/lib/social/productKnowledge";

// Separate from lib/social/contentGenerator.ts on purpose: LinkedIn reads
// nothing like Instagram/TikTok/Facebook (longer-form, no hashtag spam,
// professional-but-human tone) and it always represents Revalor LLC
// specifically, never a social_content brand row - a dedicated prompt keeps
// that fixed instead of threading brand selection through
// generateContentCalendar. It does, however, always speak on behalf of one
// specific Revalor Business product (VisionWorkx, Proactive, or Revalor
// Consulting) or the company as a whole, grounded in the product facts in
// lib/social/productKnowledge.ts (a snapshot of products.revalorllc.com)
// rather than describing Revalor generically.

export interface GeneratedLinkedInPost {
  hook: string;
  caption: string;
  hashtags: string[];
}

const PRODUCT_ANGLES: Record<Exclude<LinkedInProduct, "revalor">, string> = {
  visionworkx: `Angle it toward: a small business whose website gets visitors but doesn't capture them (no booking, no quote, no follow-up), getting leads and bookings without rebuilding the site or hiring a developer, concrete examples of a module on a real kind of business (a quote calculator for a contractor, online booking for a salon, an intake form for a consultant), or the automation that confirms to the customer and alerts the owner the moment someone submits. VisionWorkx is NOT an app builder and does not build websites or full apps — it adds modules to a site the business already has.`,
  proactive: `Angle it toward: the difference between generic advice and working through one real decision, the daily-prompt habit-building angle, or what "leadership coaching" means when it's software instead of a person.`,
  revalor_consulting: `Angle it toward: when a business has outgrown off-the-shelf tools (a custom data model, an unusual workflow, an integration), why a fixed-scope quote agreed before any build work matters, or the difference between an in-house team that ships its own live products and an agency handoff. Where it fits, note that a custom build can sit alongside VisionWorkx modules on the site the business already has.`,
};

const REVALOR_COMPANY_CONTEXT = `Product: Revalor LLC as a company (products.revalorllc.com) — not one specific app, but the company itself. Tagline: "Software for the Human Condition." A veteran-owned business that builds two kinds of software: tools that help your business grow, and tools that help you live better — both a little more human, and a lot less manual. Six live products across three product lines:
- Revalor Business (growth, automation, efficiency, operations): VisionWorkx (booking, lead capture and automatic follow-up modules for the website a business already has), Revalor Consulting (custom-built web applications by Revalor's own team), and Proactive (AI leadership coaching).
- Revalor Kids (fun, screen-safe tools that build real-world habits): Chorebit (chores into savings goals), FeelFlow (emotional check-ins), MindBit (self-control games).
- Revalor Wellness (mental clarity, calm, grounded daily reflection): Sanctum.
Angle it toward: the philosophy connecting products that otherwise look unrelated, why a small company builds across business, family, and wellness instead of picking one niche, or a founder's-eye view of what "less manual, more human" actually means in practice. Don't single out or oversell any one product by name as the flagship — this post speaks for the company, not a pitch for a specific app.`;

function productContext(product: LinkedInProduct): string {
  if (product === "revalor") return REVALOR_COMPANY_CONTEXT;
  return `Product (products.revalorllc.com):\n${formatProductKnowledge(product)}\n${PRODUCT_ANGLES[product]}`;
}

const SYSTEM_PROMPT_HEADER = `You write LinkedIn posts for Revalor LLC, promoting one specific Revalor Business product per post. Revalor's throughline across everything it builds: less manual, more human.

Rules:
- Write like a founder sharing something genuine about this specific product, not a corporate brand account. LinkedIn rewards specificity and a real point of view over generic uplift.
- Stay grounded in the product's actual, listed capabilities, plans, and prices below. Do not invent features, prices, or free tiers it doesn't have, and do not describe Revalor generically — this post is about this product.
- hook: the first line, which LinkedIn truncates the rest behind a "see more" - it must stand alone and earn the click (<=100 chars).
- caption: 3-6 short paragraphs, professional but conversational. No corporate jargon, no excessive emoji, no hashtag stuffing inside the body.
- hashtags: 3-5 relevant, professional tags (e.g. "smallbusiness", "softwaredevelopment", "founderstory"), no "#" prefix, lowercase.
- No generic filler ("Excited to announce!", "Thrilled to share!"). Be specific about what this product actually does or believes.
- This is manually reviewed and posted by a human, never auto-published - so it's fine to be a little more considered/longer-form than the fast-turnaround social content elsewhere.

Output ONLY a JSON object, no prose, no markdown fences: { "hook": string, "caption": string, "hashtags": string[] }.`;

export async function generateLinkedInPost(params: { topic?: string; product?: LinkedInProduct }): Promise<GeneratedLinkedInPost> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const product = params.product ?? "visionworkx";

  const systemPrompt = `${SYSTEM_PROMPT_HEADER}\n\n${productContext(product)}`;

  const userPrompt = params.topic
    ? `Write a LinkedIn post about: ${params.topic}`
    : `Write a LinkedIn post about this product - pick whichever angle from the suggestions above (or another one grounded in its real capabilities) makes the most compelling post.`;

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1200,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  await logAiUsage({
    source: "linkedin_post_generate",
    model: "claude-sonnet-4-6",
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
  });

  const block = message.content[0];
  const text = block?.type === "text" ? block.text : "";

  const parsed = extractJson<GeneratedLinkedInPost>(text, /\{[\s\S]*\}/, "LinkedIn post generation");
  return {
    hook: String(parsed.hook ?? "").slice(0, 100),
    caption: String(parsed.caption ?? ""),
    hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags.map((h) => String(h).replace(/^#/, "").toLowerCase()) : [],
  };
}
