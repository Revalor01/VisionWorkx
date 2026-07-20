// Google Places enrichment — fetches review text for the Tier 2
// pain-keyword signal. Exists because Yelp's /reviews endpoint now
// 404s on standard free-tier keys (see yelpEnrichment.ts); Yelp
// Business Search still works fine and remains the source for
// rating/review_count. Best-effort throughout: any miss just returns
// an empty array rather than failing the lead.

const PLACES_BASE = "https://maps.googleapis.com/maps/api/place";

interface FindPlaceResult {
  candidates: { place_id: string }[];
}

interface PlaceDetailsResult {
  result?: { reviews?: { text: string }[] };
}

export async function findGoogleReviewExcerpts(
  businessName: string,
  lat: number,
  lon: number
): Promise<string[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return [];

  const findUrl =
    `${PLACES_BASE}/findplacefromtext/json` +
    `?input=${encodeURIComponent(businessName)}` +
    `&inputtype=textquery&fields=place_id` +
    `&locationbias=circle:150@${lat},${lon}` +
    `&key=${apiKey}`;

  const findRes = await fetch(findUrl);
  if (!findRes.ok) return [];
  const { candidates } = (await findRes.json()) as FindPlaceResult;
  const placeId = candidates[0]?.place_id;
  if (!placeId) return [];

  const detailsUrl = `${PLACES_BASE}/details/json?place_id=${placeId}&fields=reviews&key=${apiKey}`;
  const detailsRes = await fetch(detailsUrl);
  if (!detailsRes.ok) return [];
  const { result } = (await detailsRes.json()) as PlaceDetailsResult;

  return (result?.reviews ?? []).map((r) => r.text);
}
