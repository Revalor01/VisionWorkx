import Anthropic from "@anthropic-ai/sdk";
import { logAiUsage } from "@/lib/aiUsage";
import type { LinkedInProduct } from "@/lib/database.types";

// Separate from lib/social/contentGenerator.ts on purpose: LinkedIn reads
// nothing like Instagram/TikTok/Facebook (longer-form, no hashtag spam,
// professional-but-human tone) and it always represents Revalor LLC
// specifically, never a social_content brand row - a dedicated prompt keeps
// that fixed instead of threading brand selection through
// generateContentCalendar. It does, however, always speak on behalf of one
// specific Revalor Business product (VisionWorkx or Proactive) so the post
// stays grounded in that product's real capabilities from
// products.revalorllc.com rather than describing Revalor generically.

export interface GeneratedLinkedInPost {
  hook: string;
  caption: string;
  hashtags: string[];
}

const PRODUCT_CONTEXT: Record<LinkedInProduct, string> = {
  visionworkx: `Product: VisionWorkx (products.revalorllc.com) — an AI-powered app builder for small businesses and entrepreneurs. You describe the app you need in plain English and it builds it: booking systems, CRMs, invoicing tools, and more, ready to use in minutes. It includes integrated automation that sends emails for bookings and leads without extra setup. Pricing runs from a free tier (25 emails/month) up to Pro (2,000 emails/month). A companion product, VisionWorkx Promote (AI ad generation), is coming soon.
Angle it toward: how much manual setup/dev work this replaces for a non-technical founder, concrete examples of apps it can build, or the automation piece saving time on lead follow-up.`,
  proactive: `Product: Proactive (products.revalorllc.com) — a leadership coaching platform for people trying to get clarity, leadership, and growth. It gives daily leadership prompts across decisiveness, organization, problem-solving, and resource management, plus Collaborator, an AI coach you can talk through a real, specific decision with conversationally instead of getting generic wellness content.
Angle it toward: the difference between generic advice and working through one real decision, the daily-prompt habit-building angle, or what "leadership coaching" means when it's software instead of a person.`,
};

const SYSTEM_PROMPT_HEADER = `You write LinkedIn posts for Revalor LLC, promoting one specific Revalor Business product per post. Revalor's throughline across everything it builds: less manual, more human.

Rules:
- Write like a founder sharing something genuine about this specific product, not a corporate brand account. LinkedIn rewards specificity and a real point of view over generic uplift.
- Stay grounded in the product's actual, listed capabilities below. Do not invent features it doesn't have, and do not describe Revalor generically — this post is about this product.
- hook: the first line, which LinkedIn truncates the rest behind a "see more" - it must stand alone and earn the click (<=100 chars).
- caption: 3-6 short paragraphs, professional but conversational. No corporate jargon, no excessive emoji, no hashtag stuffing inside the body.
- hashtags: 3-5 relevant, professional tags (e.g. "smallbusiness", "softwaredevelopment", "founderstory"), no "#" prefix, lowercase.
- No generic filler ("Excited to announce!", "Thrilled to share!"). Be specific about what this product actually does or believes.
- This is manually reviewed and posted by a human, never auto-published - so it's fine to be a little more considered/longer-form than the fast-turnaround social content elsewhere.

Output ONLY a JSON object, no prose, no markdown fences: { "hook": string, "caption": string, "hashtags": string[] }.`;

export async function generateLinkedInPost(params: { topic?: string; product?: LinkedInProduct }): Promise<GeneratedLinkedInPost> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const product = params.product ?? "visionworkx";

  const systemPrompt = `${SYSTEM_PROMPT_HEADER}\n\n${PRODUCT_CONTEXT[product]}`;

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

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("LinkedIn post generation returned no parseable JSON");

  const parsed = JSON.parse(jsonMatch[0]) as GeneratedLinkedInPost;
  return {
    hook: String(parsed.hook ?? "").slice(0, 100),
    caption: String(parsed.caption ?? ""),
    hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags.map((h) => String(h).replace(/^#/, "").toLowerCase()) : [],
  };
}
