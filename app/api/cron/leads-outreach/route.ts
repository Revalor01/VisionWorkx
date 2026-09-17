import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { sendOutreachBatch } from "@/lib/leads/outreach";

export const runtime = "nodejs";
export const maxDuration = 60;

const DAILY_LIMIT = 20;

// Rough continental-US bounding box. The scraped `leads` table has real
// contamination from outside the target market — found 2026-09-17 when
// selecting a test batch: 16 of 240 emailable leads were Ukrainian
// (Cyrillic business names, Kremenchuk coordinates), and the ONE lead
// with both an email and a score >=80 was one of them, meaning
// final_score alone is not a trustworthy filter here yet. Geography is a
// blunter but reliable backstop until the scoring pipeline gets an
// explicit country/language check.
const US_LAT_MIN = 24;
const US_LAT_MAX = 50;
const US_LNG_MIN = -125;
const US_LNG_MAX = -66;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = createServiceClient();

  const { data: candidates, error } = await service
    .from("leads")
    .select("id")
    .eq("status", "new")
    .eq("do_not_email", false)
    .not("email", "is", null)
    .gte("lat", US_LAT_MIN)
    .lte("lat", US_LAT_MAX)
    .gte("lng", US_LNG_MIN)
    .lte("lng", US_LNG_MAX)
    .order("final_score", { ascending: false })
    .limit(DAILY_LIMIT);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!candidates || candidates.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, message: "No eligible leads left to contact today." });
  }

  try {
    const result = await sendOutreachBatch(
      service,
      candidates.map((c) => c.id),
      "generic"
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
