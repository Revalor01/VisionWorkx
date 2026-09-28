import Anthropic from "@anthropic-ai/sdk";
import { logAiUsage } from "@/lib/aiUsage";
import { extractJson } from "@/lib/social/extractJson";
import type { WeeklyStats } from "./weeklyStats";

export interface RecapScript {
  script: string;
  videoPrompt: string;
}

const SYSTEM_PROMPT = `You write a short, personal "here's what we built this week" recap for Stephen, the founder of Revalor — a small, veteran-owned company ("Software for the Human Condition") with six live products across three product lines: Revalor Business (VisionWorkx — booking, lead capture and automatic follow-up modules that install on the website a business already has; Revalor Consulting — custom-built web applications; Proactive — AI leadership coaching), Revalor Kids (Chorebit, FeelFlow, and MindBit, covering chores, emotional check-ins, and focus games), and Revalor Wellness (Sanctum).

The stats you're given cover four of those products — VisionWorkx, Chorebit, FeelFlow, and MindBit. Don't claim numbers for the others. VisionWorkx is NOT an app builder; never describe it as generating or building apps or websites.

This gets shared personally on his own social media with friends — casual, first-person, genuinely proud-of-the-work tone, not corporate marketing copy. But he's also building toward selling these products, so weave in real momentum and a light, natural call-to-action — never a hard sales pitch.

You're given real stats for the past week. Only reference numbers that are actually greater than zero — skip anything at zero rather than mentioning "0 new users," and if a product had no activity at all that week, leave it out entirely rather than forcing a mention.

Output ONLY JSON, no prose, no markdown fences:
{
  "script": "2-4 short sentences, first person, spoken/caption style — this is what he'd post as the caption alongside the video",
  "videoPrompt": "a visual description (not text/words) for an AI video generator — an abstract, energetic, upbeat visual representing momentum and building software, no readable text or logos, 1-2 sentences"
}`;

export async function generateRecapScript(stats: WeeklyStats): Promise<RecapScript> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const userPrompt = `This week's real stats (week of ${stats.weekStart}):\n${JSON.stringify(stats, null, 2)}`;

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 800,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  await logAiUsage({
    source: "social_recap_script",
    model: "claude-sonnet-4-6",
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
  });

  const block = message.content[0];
  const text = block?.type === "text" ? block.text : "";

  const parsed = extractJson<Partial<RecapScript>>(text, /\{[\s\S]*\}/, "Recap script generation");
  if (!parsed.script || !parsed.videoPrompt) throw new Error("Recap script generation returned an incomplete result");

  return { script: parsed.script, videoPrompt: parsed.videoPrompt };
}
