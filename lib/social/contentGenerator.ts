import Anthropic from "@anthropic-ai/sdk";
import type { SocialPlatform } from "@/lib/database.types";

export interface GeneratedPost {
  platform: SocialPlatform;
  hook: string;
  caption: string;
  hashtags: string[];
}

const MAX_POSTS_PER_CALL = 14; // ~2 weeks of daily posts — keeps one Claude call cheap and reliable

const SYSTEM_PROMPT = `You write social media content for Revalor LLC's own products. Write like a founder posting about something they genuinely built, not a generic marketing account.

Rules:
- Each post needs a distinct angle — don't just reword the same idea across posts
- hook: a short, scroll-stopping first line (<=80 chars)
- caption: the full post body, platform-appropriate length (Instagram can run longer/more personal; Facebook can be a bit more direct/informational)
- hashtags: 3-8 relevant tags, no "#" prefix in the output, lowercase
- No generic filler ("Check this out!", "Exciting news!") — be specific about what the product actually does
- Respect the brand voice notes provided exactly — they describe how this specific brand should sound

Output ONLY a JSON array, no prose, no markdown fences. Each element: { "platform": "facebook"|"instagram", "hook": string, "caption": string, "hashtags": string[] }.`;

export async function generateContentCalendar(params: {
  brandName: string;
  voiceNotes: string | null;
  platforms: SocialPlatform[];
  postCount: number;
}): Promise<GeneratedPost[]> {
  const { brandName, voiceNotes, platforms, postCount } = params;
  const count = Math.min(postCount, MAX_POSTS_PER_CALL);

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const userPrompt = `Brand: ${brandName}
Voice notes: ${voiceNotes || "(none provided — use a confident, clear, founder-built tone)"}
Platforms to generate for: ${platforms.join(", ")}
Generate exactly ${count} posts total, distributed across the requested platforms, as a JSON array.`;

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 400 * count,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const block = message.content[0];
  const text = block?.type === "text" ? block.text : "";

  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error("Content generation returned no parseable JSON");

  const parsed = JSON.parse(jsonMatch[0]) as GeneratedPost[];
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("Content generation returned an empty result");
  }

  return parsed.slice(0, count).map((p) => ({
    platform: p.platform === "instagram" ? "instagram" : "facebook",
    hook: String(p.hook ?? "").slice(0, 80),
    caption: String(p.caption ?? ""),
    hashtags: Array.isArray(p.hashtags) ? p.hashtags.map((h) => String(h).replace(/^#/, "").toLowerCase()) : [],
  }));
}
