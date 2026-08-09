// Keyword research — Google Autocomplete only (free, no key required).
// Ported from the original seo-automation Python script's scoring/filtering
// logic (keywords.py: _score_keyword / _filter_keywords), minus the
// Ubersuggest integration — that rested on an unverified API contract
// (guessed endpoint/field names) and isn't worth building on unconfirmed.

export interface KeywordCandidate {
  keyword: string;
  volume: number | null;
  difficulty: number | null;
  cpc: number | null;
  source: string;
  score: number;
}

async function googleAutocomplete(seed: string): Promise<string[]> {
  const url = new URL("https://suggestqueries.google.com/complete/search");
  url.searchParams.set("client", "firefox");
  url.searchParams.set("q", seed);

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) return [];

  const data = (await res.json()) as [string, string[]];
  const suggestions = data[1] ?? [];
  return suggestions
    .map((s) => s.toLowerCase().trim())
    .filter((s) => s && s !== seed.toLowerCase().trim());
}

// No real volume/difficulty data available from Autocomplete — score is
// purely a placeholder (mid-range) so filtering doesn't reject everything.
function scoreKeyword(): number {
  return 50;
}

export async function researchKeywords(seedKeywords: string[]): Promise<KeywordCandidate[]> {
  const seen = new Set<string>();
  const results: KeywordCandidate[] = [];

  for (const seed of seedKeywords) {
    const suggestions = await googleAutocomplete(seed);
    for (const keyword of suggestions) {
      if (seen.has(keyword)) continue;
      seen.add(keyword);
      results.push({
        keyword,
        volume: null,
        difficulty: null,
        cpc: null,
        source: "google_autocomplete",
        score: scoreKeyword(),
      });
    }
    // polite rate limiting, matches the original script
    await new Promise((r) => setTimeout(r, 300));
  }

  return results;
}
