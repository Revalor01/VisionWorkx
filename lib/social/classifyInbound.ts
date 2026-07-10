import Anthropic from "@anthropic-ai/sdk";

export interface ClassificationResult {
  classification: "auto_answered" | "requires_human";
  replyText: string | null;
}

const SYSTEM_PROMPT = `You triage incoming social media DMs/comments for a small company. You're given a brand's FAQ document and one incoming message.

If the message is a simple, common question that's clearly and confidently answered by the FAQ document, respond with a short, friendly, on-brand reply (2-3 sentences max) and classify it "auto_answered".

If the message is anything else — a complaint, a sales inquiry, something not covered by the FAQ, something ambiguous, or anything where a wrong automated answer could look bad — classify it "requires_human" and leave replyText null. When genuinely unsure, always choose "requires_human" — a missed auto-reply is far cheaper than a wrong one sent to a real customer.

Output ONLY JSON, no prose: { "classification": "auto_answered" | "requires_human", "replyText": string | null }`;

export async function classifyInboundMessage(params: {
  faqDocument: string | null;
  messageText: string;
}): Promise<ClassificationResult> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const userPrompt = `FAQ document:
${params.faqDocument || "(none provided — treat everything as requires_human)"}

Incoming message:
${params.messageText}`;

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 500,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const block = message.content[0];
  const text = block?.type === "text" ? block.text : "";

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    // Fail safe toward human review rather than throwing and losing the message.
    return { classification: "requires_human", replyText: null };
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]) as ClassificationResult;
    if (parsed.classification === "auto_answered" && parsed.replyText) {
      return { classification: "auto_answered", replyText: parsed.replyText };
    }
    return { classification: "requires_human", replyText: null };
  } catch {
    return { classification: "requires_human", replyText: null };
  }
}
