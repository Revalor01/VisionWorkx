import Anthropic from "@anthropic-ai/sdk";
import { logAiUsage } from "@/lib/aiUsage";

// Separate from lib/social/contentGenerator.ts on purpose: LinkedIn reads
// nothing like Instagram/TikTok/Facebook (longer-form, no hashtag spam,
// professional-but-human tone) and it always represents Revalor LLC
// specifically, never a sub-product - a dedicated prompt keeps that fixed
// instead of threading brand selection through generateContentCalendar.

export interface GeneratedLinkedInPost {
  hook: string;
  caption: string;
  hashtags: string[];
}

const SYSTEM_PROMPT = `You write LinkedIn posts for Revalor LLC, a company that builds two kinds of software: business tools (VisionWorkx - AI-generated apps for small businesses) and life tools (Chorebit, FeelFlow, MindBit for families; Sanctum for mental clarity/wellness). The throughline across everything Revalor builds: less manual, more human.

Rules:
- Write like a founder sharing something genuine, not a corporate brand account. LinkedIn rewards specificity and a real point of view over generic uplift.
- hook: the first line, which LinkedIn truncates the rest behind a "see more" - it must stand alone and earn the click (<=100 chars).
- caption: 3-6 short paragraphs, professional but conversational. No corporate jargon, no excessive emoji, no hashtag stuffing inside the body.
- hashtags: 3-5 relevant, professional tags (e.g. "smallbusiness", "softwaredevelopment", "founderstory"), no "#" prefix, lowercase.
- No generic filler ("Excited to announce!", "Thrilled to share!"). Be specific about what Revalor actually builds or believes.
- This is manually reviewed and posted by a human, never auto-published - so it's fine to be a little more considered/longer-form than the fast-turnaround social content elsewhere.

Output ONLY a JSON object, no prose, no markdown fences: { "hook": string, "caption": string, "hashtags": string[] }.`;

export async function generateLinkedInPost(params: { topic?: string }): Promise<GeneratedLinkedInPost> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const userPrompt = params.topic
    ? `Write a LinkedIn post about: ${params.topic}`
    : `Write a LinkedIn post about what Revalor LLC is building and why - pick whichever angle (the business tools, the life tools, or the philosophy connecting them) makes the most compelling post.`;

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1200,
    system: SYSTEM_PROMPT,
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
