// Yelp Fusion API enrichment — free tier, no cost. Matches an OSM-found
// business to its Yelp listing (by name + coordinates) and pulls rating
// and review count from Business Search/Details. Review excerpts are
// also attempted, but verified live (2026-07): the /reviews endpoint
// 404s on a standard free-tier key even for a valid business ID that
// Search/Details both resolve fine — Yelp restricts it to approved
// partners now. Left in place in case that ever changes; until then
// reviewExcerpts is always empty and the Tier 2 pain-keyword signal
// never fires, but rating/review_count (the more valuable signals)
// work normally. Best-effort throughout: if Yelp has no match, callers
// just get nulls back and scoring proceeds without the Yelp-derived
// signals rather than failing the whole lead.

const YELP_BASE = "https://api.yelp.com/v3";

export interface YelpMatch {
  yelpId: string;
  rating: number;
  reviewCount: number;
  reviewExcerpts: string[];
}

interface YelpBusinessSearchResult {
  businesses: {
    id: string;
    name: string;
    rating: number;
    review_count: number;
  }[];
}

interface YelpReviewsResult {
  reviews: { text: string }[];
}

export async function findYelpMatch(
  businessName: string,
  lat: number,
  lon: number
): Promise<YelpMatch | null> {
  const apiKey = process.env.YELP_API_KEY;
  if (!apiKey) return null;

  const searchUrl = `${YELP_BASE}/businesses/search?term=${encodeURIComponent(businessName)}&latitude=${lat}&longitude=${lon}&radius=150&limit=1`;
  const searchRes = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!searchRes.ok) return null;

  const { businesses } = (await searchRes.json()) as YelpBusinessSearchResult;
  const match = businesses[0];
  if (!match) return null;

  let reviewExcerpts: string[] = [];
  try {
    const reviewsRes = await fetch(`${YELP_BASE}/businesses/${match.id}/reviews`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (reviewsRes.ok) {
      const { reviews } = (await reviewsRes.json()) as YelpReviewsResult;
      reviewExcerpts = reviews.map((r) => r.text);
    }
  } catch {
    // Non-fatal — proceed with rating/review_count even without excerpts.
  }

  return {
    yelpId: match.id,
    rating: match.rating,
    reviewCount: match.review_count,
    reviewExcerpts,
  };
}

// Tier 2's "review mentions booking/wait problems" signal — keyword
// match against whatever excerpts the free API actually returns (up to
// 3, not the business's full review history, so this is a best-effort
// sample rather than a comprehensive scan).
const PAIN_KEYWORDS = [
  "couldn't book", "cant book", "can't book", "hard to reach", "long wait",
  "cash only", "no online booking", "never answer", "no response",
  "no appointment", "walk-in only", "walk ins only",
];

export function reviewsHavePainSignal(excerpts: string[]): boolean {
  const combined = excerpts.join(" ").toLowerCase();
  return PAIN_KEYWORDS.some((kw) => combined.includes(kw));
}
