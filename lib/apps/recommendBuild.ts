import Anthropic from "@anthropic-ai/sdk";
import { logAiUsage } from "@/lib/aiUsage";
import type { AppCategory } from "@/lib/database.types";

// The /try text recommender: a prospect describes their business in
// plain language and this maps it to the same structured intake the form
// collects (primary category, extra capabilities, staff logins) so they
// don't have to know what "CRM" vs "Portal" means. It only pre-fills the
// form — the user reviews and edits before anything is built.

export interface BuildRecommendation {
  category: AppCategory;
  secondaryCategories: AppCategory[];
  teamLogins: boolean;
  rationale: string;
}

const CATEGORIES: { id: AppCategory; blurb: string }[] = [
  { id: "booking", blurb: "appointments, scheduling, a public booking page" },
  { id: "crm", blurb: "tracking contacts, leads, deals, follow-ups" },
  { id: "inventory", blurb: "stock levels, orders, reordering, suppliers" },
  { id: "portal", blurb: "a client login to check status, share files, pay invoices" },
  { id: "invoicing", blurb: "quotes, estimates, invoices, getting paid" },
  { id: "membership", blurb: "recurring memberships, check-ins, plan tiers" },
];

const ALL: AppCategory[] = CATEGORIES.map((c) => c.id);

const SYSTEM_PROMPT = `You help a non-technical US small-business owner decide what their web app should do, from a short description of their business.

Recommend:
- category: the single best-fit primary capability
- secondaryCategories: 0-3 extra capabilities that clearly apply. Only add one if the description genuinely implies it — most businesses need just the primary.
- teamLogins: true only if the description implies multiple staff who each need their own login
- rationale: one or two plain sentences, addressed to the owner ("You mentioned…"), explaining the pick. No jargon, no tech terms.

Categories:
${CATEGORIES.map((c) => `- ${c.id}: ${c.blurb}`).join("\n")}

Output ONLY JSON, no prose: { "category": string, "secondaryCategories": string[], "teamLogins": boolean, "rationale": string }`;

const FALLBACK: BuildRecommendation = {
  category: "booking",
  secondaryCategories: [],
  teamLogins: false,
  rationale: "",
};

export async function recommendBuild(input: {
  businessName: string;
  businessType: string;
  description: string;
}): Promise<BuildRecommendation> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const user = [
    `Business: ${input.businessName || "(unnamed)"} — ${input.businessType}`,
    `What they said they need: ${input.description}`,
  ].join("\n");

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 400,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: user }],
  });

  await logAiUsage({
    source: "try_recommend",
    model: "claude-sonnet-4-6",
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
  });

  const block = message.content[0];
  const text = block?.type === "text" ? block.text : "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return FALLBACK;

  try {
    const p = JSON.parse(jsonMatch[0]) as {
      category?: unknown;
      secondaryCategories?: unknown;
      teamLogins?: unknown;
      rationale?: unknown;
    };
    const category = ALL.includes(p.category as AppCategory) ? (p.category as AppCategory) : "booking";
    const secondaryCategories = Array.isArray(p.secondaryCategories)
      ? [...new Set(p.secondaryCategories)]
          .filter((c): c is AppCategory => ALL.includes(c as AppCategory) && c !== category)
          .slice(0, 3)
      : [];
    return {
      category,
      secondaryCategories,
      teamLogins: p.teamLogins === true,
      rationale: typeof p.rationale === "string" ? p.rationale.trim().slice(0, 300) : "",
    };
  } catch {
    return FALLBACK;
  }
}
