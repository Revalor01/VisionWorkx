import Anthropic from "@anthropic-ai/sdk";
import { logAiUsage } from "@/lib/aiUsage";
import { extractJson } from "@/lib/social/extractJson";
import type { LinkedInProduct } from "@/lib/database.types";
import type { LinkedInPostType } from "@/lib/social/linkedinRotation";
import { formatProductKnowledge } from "@/lib/social/productKnowledge";

// Separate from lib/social/contentGenerator.ts on purpose: LinkedIn reads
// nothing like Instagram/TikTok/Facebook (longer-form, no hashtag spam,
// professional-but-human tone) and it always represents Revalor LLC
// specifically, never a social_content brand row - a dedicated prompt keeps
// that fixed instead of threading brand selection through
// generateContentCalendar. Each post is tied to one Revalor Business product
// (VisionWorkx Modules, Proactive, Revalor Consulting) or the company as a
// whole - as the topic area for value posts, the subject for story and
// promotion posts - grounded in the product facts in
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
Angle it toward: the philosophy connecting products that otherwise look unrelated, why a small company builds across business, family, and wellness instead of picking one niche, or a founder's-eye view of what "less manual, more human" actually means in practice. Don't single out or oversell any one product by name as the flagship — this post speaks for the company, not a pitch for a specific app. LinkedIn targets business owners: mention the Kids and Wellness products only as founder "things I've built" stories, never as something to buy.`;

function productContext(product: LinkedInProduct): string {
  if (product === "revalor") return REVALOR_COMPANY_CONTEXT;
  return `Product (products.revalorllc.com):\n${formatProductKnowledge(product)}\n${PRODUCT_ANGLES[product]}`;
}

// Follows Revalor's LinkedIn strategy (linkedin-strategy skill): founder
// first-person voice, value first, a 4-week rotation of post types
// (lib/social/linkedinRotation.ts) and problem-first hooks.
const SYSTEM_PROMPT_HEADER = `You write LinkedIn posts for the founder of Revalor LLC, a small veteran-owned software company. The post goes out on the founder's personal profile and the Revalor LLC company page. Revalor's throughline: less manual, more human.

Voice:
- First person, as the founder ("I", "we" for the team). A real operator sharing what they've seen, not a brand account.
- Professional but conversational. Specific beats generic. No corporate jargon, no hype, no "Excited to announce!".

Hook rules (based on Revalor's own performance data):
- The first line names a real problem or situation, never the pitch. LinkedIn cuts the rest behind "see more", so it must stand alone (<=100 chars).
- Best pattern: "[Real situation happened]. So I built / we fixed [thing]." e.g. "A client lost three quote requests in one weekend. So we fixed that."
- Practical tips beat product promos (e.g. "Ever notice AI getting worse the longer a chat goes on? Fix: ...").
- Never invent clients, numbers or events presented as real. Describe common situations ("A lot of contractors I talk to...", "Here's a pattern I keep seeing...") unless the topic gives a real one.
- No generic CTAs like "Check out what we do."

Format:
- caption: 3-6 short paragraphs (the hook is NOT repeated at the start of the caption). Plain text, no markdown, at most one or two emoji, no hashtags in the body.
- hashtags: 3-5 professional tags, lowercase, no "#".
- Stay grounded in the product facts below. Never invent features, prices or free tiers.
- Don't add a link; a tracked link to the product page is added automatically when the post goes out.

`;

const POST_TYPE_RULES: Record<LinkedInPostType, string> = {
  insight: `THIS POST: Business / operations insight. Pure value, NO pitch.
- Pick one practical topic a small-business owner or operator can use today: a workflow bottleneck, a handoff that breaks, practical automation, a lightweight tool habit, spotting an operational gap, or a practical AI tip for small businesses.
- Teach something concrete: a pattern, a checklist, a before/after, a mistake to avoid, a 3-step fix. The reader should get value even if they never buy anything.
- Do NOT name or sell any Revalor product. At most, one closing line of founder context ("this is the kind of thing we build for") is fine but not required.
- End with a genuine question to business owners to invite comments.`,
  story: `THIS POST: Product story. Use case, not feature list.
- Structure: a real-feeling problem -> "so I built / we built..." -> how it works in practice for one kind of business -> what changed.
- Name the product once it enters the story (not in the hook). Show one concrete use case, not a list of features.
- Close with a soft line, not a hard sell.`,
  promo: `THIS POST: Promotion (max one a month).
- One specific offer and exactly one call to action tied to a concrete outcome (e.g. book a workflow review, try a new add-on, start the plan that fits).
- Still lead with the problem in the hook. Name the product and the offer clearly in the body. No more than one CTA.`,
};

const OUTPUT_RULES = `Output ONLY a JSON object, no prose, no markdown fences: { "hook": string, "caption": string, "hashtags": string[] }.`;

export async function generateLinkedInPost(params: {
  topic?: string;
  product?: LinkedInProduct;
  postType?: LinkedInPostType;
}): Promise<GeneratedLinkedInPost> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const product = params.product ?? "visionworkx";
  const postType = params.postType ?? "insight";

  // Insight posts get the product only as background (what the founder
  // builds, who they talk to); the post itself must not sell it.
  const context =
    postType === "insight"
      ? `Background only (who the founder is and who they talk to; do NOT pitch it):\n${productContext(product)}`
      : productContext(product);
  const systemPrompt = `${SYSTEM_PROMPT_HEADER}\n${POST_TYPE_RULES[postType]}\n\n${context}\n\n${OUTPUT_RULES}`;

  const userPrompt = params.topic
    ? `Write the post about: ${params.topic}`
    : postType === "insight"
      ? `Pick one practical business/operations topic this product's audience deals with and write the post.`
      : `Pick the most compelling real use case or offer grounded in the facts above and write the post.`;

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
