import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createServiceClient } from "@/lib/supabase";
import { classifyIndustry, detectLanguage, distanceMiles, scoreLead } from "@/lib/leadScoring";
import { findYelpMatch, reviewsHavePainSignal } from "@/lib/yelpEnrichment";
import { findGoogleReviewExcerpts } from "@/lib/googlePlacesEnrichment";

const ADMIN_EMAIL = "sawilliams721@gmail.com";

// Curated OSM tag list — only fetch business types classifyIndustry()
// actually knows how to categorize, rather than pulling every shop in
// the search area.
const OSM_TAGS: [string, string][] = [
  ["shop", "hairdresser"],
  ["shop", "beauty"],
  ["shop", "tattoo"],
  ["craft", "electrician"],
  ["craft", "plumber"],
  ["craft", "hvac"],
  ["shop", "trade"],
  ["amenity", "gym"],
  ["leisure", "fitness_centre"],
  ["shop", "car_repair"],
  ["shop", "laundry"],
  ["shop", "dry_cleaning"],
  ["amenity", "restaurant"],
  ["amenity", "cafe"],
  ["amenity", "dentist"],
  ["shop", "pet"],
  ["amenity", "veterinary"],
  ["shop", "florist"],
  ["shop", "convenience"],
  ["amenity", "bar"],
  ["amenity", "pub"],
  ["amenity", "fast_food"],
];

interface OverpassElement {
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

async function geocode(location: string): Promise<{ lat: number; lon: number }> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(location)}&format=json&limit=1`;
  const res = await fetch(url, {
    headers: { "User-Agent": "VisionWorkx-LeadFinder/1.0 (internal sales tooling)" },
  });
  if (!res.ok) throw new Error(`Nominatim error: ${res.status}`);
  const results = (await res.json()) as { lat: string; lon: string }[];
  if (results.length === 0) throw new Error(`No location found for "${location}"`);
  return { lat: parseFloat(results[0].lat), lon: parseFloat(results[0].lon) };
}

async function queryOverpass(lat: number, lon: number, radiusMeters: number): Promise<OverpassElement[]> {
  const clauses = OSM_TAGS.map(
    ([key, value]) => `node["${key}"="${value}"](around:${radiusMeters},${lat},${lon});`
  ).join("\n  ");

  const query = `[out:json][timeout:25];\n(\n  ${clauses}\n);\nout body;`;

  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "Content-Type": "text/plain", "User-Agent": "VisionWorkx-LeadFinder/1.0 (internal sales tooling)" },
    body: query,
  });
  if (!res.ok) throw new Error(`Overpass error: ${res.status}`);
  const data = (await res.json()) as { elements: OverpassElement[] };
  return data.elements;
}

function formatAddress(tags: Record<string, string>): string | null {
  const parts = [
    tags["addr:housenumber"],
    tags["addr:street"],
    tags["addr:city"],
    tags["addr:state"],
    tags["addr:postcode"],
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : null;
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user || user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { location?: string; radiusMiles?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const location = body.location?.trim();
  if (!location) {
    return NextResponse.json({ error: "Missing location" }, { status: 400 });
  }
  const radiusMeters = Math.min(Math.max(body.radiusMiles ?? 5, 1), 25) * 1609.34;

  let elements: OverpassElement[];
  let originLat: number;
  let originLon: number;
  try {
    const origin = await geocode(location);
    originLat = origin.lat;
    originLon = origin.lon;
    elements = await queryOverpass(originLat, originLon, radiusMeters);
  } catch (err) {
    console.error("[api/admin/leads/search]", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }

  const service = createServiceClient();
  let upserted = 0;

  // Enrichment (Yelp + Google Places) is the bottleneck — up to 4
  // sequential network round-trips per lead. Run the two enrichment
  // calls per lead in parallel, and process leads themselves in
  // concurrent batches, or a large result set blows past the
  // function's execution time limit.
  const BATCH_SIZE = 8;
  const usableElements = elements.filter((el) => el.tags?.name);

  for (let i = 0; i < usableElements.length; i += BATCH_SIZE) {
    const batch = usableElements.slice(i, i + BATCH_SIZE);

    const results = await Promise.all(
      batch.map(async (el) => {
        const tags = el.tags ?? {};
        const businessName = tags.name!;
        const website = tags.website ?? tags["contact:website"] ?? null;
        const hasFacebookOnly = !website && Boolean(tags["contact:facebook"] ?? tags.facebook);
        const { category, multiplier } = classifyIndustry(tags);
        const language = detectLanguage(tags, businessName);
        const lat = el.lat ?? el.center?.lat ?? null;
        const lon = el.lon ?? el.center?.lon ?? null;
        const distance = lat && lon ? distanceMiles(originLat, originLon, lat, lon) : null;

        // Best-effort — a missing key or no match just means those
        // signals don't fire, not a failed lead. Yelp's /reviews
        // endpoint 404s on free-tier keys, so review text comes from
        // Google Places instead; Yelp Business Search still supplies
        // rating/review_count.
        const [yelpMatch, reviewExcerpts] = await Promise.all([
          lat && lon ? findYelpMatch(businessName, lat, lon).catch(() => null) : Promise.resolve(null),
          lat && lon ? findGoogleReviewExcerpts(businessName, lat, lon).catch(() => []) : Promise.resolve([]),
        ]);
        const yelpPainSignal = reviewsHavePainSignal(reviewExcerpts);

        const { rawScore, finalScore, signalBreakdown } = scoreLead({
          website,
          phone: tags.phone ?? tags["contact:phone"] ?? null,
          email: tags.email ?? tags["contact:email"] ?? null,
          openingHours: tags.opening_hours ?? null,
          hasFacebookOnly,
          industryMultiplier: multiplier,
          yelpReviewCount: yelpMatch?.reviewCount ?? null,
          yelpRating: yelpMatch?.rating ?? null,
          yelpReviewsHavePainSignal: yelpPainSignal,
        });

        return service.from("leads").upsert(
          {
            source: "osm",
            source_id: String(el.id),
            business_name: businessName,
            business_type: tags.shop ?? tags.amenity ?? tags.craft ?? tags.leisure ?? null,
            industry_category: category,
            address: formatAddress(tags),
            lat,
            lng: lon,
            distance_miles: distance,
            phone: tags.phone ?? tags["contact:phone"] ?? null,
            email: tags.email ?? tags["contact:email"] ?? null,
            website,
            has_facebook_only: hasFacebookOnly,
            opening_hours: tags.opening_hours ?? null,
            detected_language: language,
            yelp_id: yelpMatch?.yelpId ?? null,
            yelp_rating: yelpMatch?.rating ?? null,
            yelp_review_count: yelpMatch?.reviewCount ?? null,
            yelp_review_excerpts: reviewExcerpts,
            raw_score: rawScore,
            industry_multiplier: multiplier,
            final_score: finalScore,
            signal_breakdown: signalBreakdown,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "source,source_id", ignoreDuplicates: false }
        );
      })
    );

    upserted += results.filter((r) => !r.error).length;
  }

  return NextResponse.json({ ok: true, found: elements.length, upserted });
}
