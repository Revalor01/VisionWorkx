import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createServiceClient } from "@/lib/supabase";
import { classifyIndustry, detectLanguage, scoreLead } from "@/lib/leadScoring";

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
  try {
    const { lat, lon } = await geocode(location);
    elements = await queryOverpass(lat, lon, radiusMeters);
  } catch (err) {
    console.error("[api/admin/leads/search]", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }

  const service = createServiceClient();
  let upserted = 0;

  for (const el of elements) {
    const tags = el.tags ?? {};
    const businessName = tags.name;
    if (!businessName) continue; // unnamed nodes aren't usable leads

    const website = tags.website ?? tags["contact:website"] ?? null;
    const hasFacebookOnly = !website && Boolean(tags["contact:facebook"] ?? tags.facebook);
    const { category, multiplier } = classifyIndustry(tags);
    const language = detectLanguage(tags, businessName);
    const { rawScore, finalScore, signalBreakdown } = scoreLead({
      website,
      phone: tags.phone ?? tags["contact:phone"] ?? null,
      email: tags.email ?? tags["contact:email"] ?? null,
      openingHours: tags.opening_hours ?? null,
      hasFacebookOnly,
      industryMultiplier: multiplier,
    });

    const lat = el.lat ?? el.center?.lat ?? null;
    const lon = el.lon ?? el.center?.lon ?? null;

    const { error } = await service.from("leads").upsert(
      {
        source: "osm",
        source_id: String(el.id),
        business_name: businessName,
        business_type: tags.shop ?? tags.amenity ?? tags.craft ?? tags.leisure ?? null,
        industry_category: category,
        address: formatAddress(tags),
        lat,
        lng: lon,
        phone: tags.phone ?? tags["contact:phone"] ?? null,
        email: tags.email ?? tags["contact:email"] ?? null,
        website,
        has_facebook_only: hasFacebookOnly,
        opening_hours: tags.opening_hours ?? null,
        detected_language: language,
        raw_score: rawScore,
        industry_multiplier: multiplier,
        final_score: finalScore,
        signal_breakdown: signalBreakdown,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "source,source_id", ignoreDuplicates: false }
    );

    if (!error) upserted++;
  }

  return NextResponse.json({ ok: true, found: elements.length, upserted });
}
