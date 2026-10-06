import type { SocialPlatform } from "@/lib/database.types";

// The public Revalor AI quiz — a free ~2-minute lead magnet (its submissions
// land in vw_ai_quiz_leads). A fraction of VisionWorkx / Revalor LLC posts
// invite the reader to take it. Deliberately NOT for Revalor Kids or Revalor
// Wellness — the quiz is a business/AI-readiness offer, off-brand for those.
export const AI_QUIZ_URL = "https://products.revalorllc.com/ai-quiz";

const QUIZ_BRANDS = new Set<string>(["VisionWorkx", "Revalor LLC"]);

export function promotesAiQuiz(brandName: string): boolean {
  return QUIZ_BRANDS.has(brandName);
}

/** The quiz link for a platform, with a src tag so quiz leads are attributable. */
export function aiQuizLink(platform: SocialPlatform): string {
  return `${AI_QUIZ_URL}?src=${platform}`;
}

/**
 * Content-generation instruction that sprinkles the quiz CTA into ~1 in 4 posts
 * for brands that promote it; "" otherwise (so non-quiz brands get nothing).
 */
export function aiQuizCtaInstruction(brandName: string): string {
  if (!promotesAiQuiz(brandName)) return "";
  return `AI quiz CTA: for roughly 1 in 4 of these posts (about a quarter — no more), add a short, natural call-to-action inviting the reader to take Revalor's free 2-minute AI quiz, linking to ${AI_QUIZ_URL}?src=<platform> where <platform> is that post's platform (e.g. ?src=facebook). Vary the wording and only use it where it fits the post; leave the other ~3 in 4 posts without any quiz mention.`;
}
