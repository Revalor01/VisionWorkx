// Brand-safety net for auto-published blog content — mirrors the spirit of
// lib/social/riskEvaluator.ts's containsBannedWords, scoped to blog copy.
// This base list applies to every product; blog_product_config.banned_words
// (migration 36) lets a product add its own words on top of this baseline.
export const BASE_BANNED_WORDS = [
  "guaranteed",
  "guarantee",
  "cure",
  "miracle",
  "lawsuit",
  "sue",
  "scam",
  "stupid",
  "hate",
];

export function containsBannedWords(text: string, bannedWords: string[] = BASE_BANNED_WORDS): string[] {
  const lower = text.toLowerCase();
  return bannedWords.filter((word) => lower.includes(word.toLowerCase()));
}

// fully_autonomous auto-publishes above this bar; semi_autonomous requires
// the stricter bar below. manual never auto-publishes regardless of score.
export const AUTO_PUBLISH_SCORE_THRESHOLD = 80;
export const SEMI_AUTONOMOUS_SCORE_THRESHOLD = 90;
