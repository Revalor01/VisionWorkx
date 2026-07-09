import Anthropic from "@anthropic-ai/sdk";

export type AdObjective = "awareness" | "leads" | "bookings" | "promotion";
export type AdTone = "professional" | "friendly" | "urgent" | "premium";

export interface AdCopyVariant {
  headline: string; // max 40 chars
  bodyText: string; // max 125 chars
  cta: string; // max 20 chars
  script: string; // 30-second video script version
}

const SYSTEM_PROMPT = `You write ad copy for a local service business marketing platform. Write like a local business marketing expert, not a generic copywriter.

Rules:
- Headlines must be specific — include the service or city name, never generic ("Best in town" is banned)
- CTAs must be action-oriented and match the objective (e.g. "Book Now", "Get a Quote", "Call Today")
- Body copy must address one specific pain point or desire, not a vague benefit
- Each variant must take a genuinely different angle (price, urgency, trust, convenience, etc.) — do not just reword the same idea
- Respect the character limits exactly: headline <= 40 chars, bodyText <= 125 chars, cta <= 20 chars

Output ONLY a JSON array, no prose, no markdown fences. Each element: { "headline": string, "bodyText": string, "cta": string, "script": string }. "script" is a ~30-second spoken video ad script (60-80 words).`;

export async function generateAdCopy(params: {
  businessName: string;
  businessType: string;
  services: Array<{ name: string; price: number }>;
  city: string;
  objective: AdObjective;
  tone: AdTone;
  count: number;
}): Promise<AdCopyVariant[]> {
  const { businessName, businessType, services, city, objective, tone, count } = params;

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const serviceLines =
    services.length > 0
      ? services.map((s) => `- ${s.name} ($${s.price})`).join("\n")
      : "- (no services listed)";

  const userPrompt = `Business: ${businessName} (${businessType}) in ${city || "the local area"}
Objective: ${objective}
Tone: ${tone}
Services:
${serviceLines}

Generate exactly ${count} unique ad copy variants as a JSON array.`;

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 400 * count,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const block = message.content[0];
  const text = block?.type === "text" ? block.text : "";

  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error("AI copy generation returned no parseable JSON");

  const parsed = JSON.parse(jsonMatch[0]) as AdCopyVariant[];
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("AI copy generation returned an empty result");
  }

  return parsed.slice(0, count).map((v) => ({
    headline: String(v.headline ?? "").slice(0, 40),
    bodyText: String(v.bodyText ?? "").slice(0, 125),
    cta: String(v.cta ?? "").slice(0, 20),
    script: String(v.script ?? ""),
  }));
}
