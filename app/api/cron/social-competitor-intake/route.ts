import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/social/adminAuth";
import { importCompetitorIdeas } from "@/lib/social/competitorIntake";

export const runtime = "nodejs";
export const maxDuration = 60;

// Import Competitor Watch (revalor-admin) post ideas marked 'sent_to_social'
// into Revalor Social as DRAFTS. Two entrypoints:
//  - GET: the daily Vercel cron (Bearer CRON_SECRET), same as the other
//    social crons.
//  - POST: the "Import from Competitor Watch" button in /admin/social,
//    behind the shared admin check (real session or SSO cookie).
// Both run the same idempotent importer.

export async function GET(req: NextRequest) {
  // A missing CRON_SECRET must never let "Bearer undefined" through
  // (same guard as the social-images cron).
  const secret = process.env.CRON_SECRET;
  if (!secret || (req.headers.get("authorization") ?? "") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return run();
}

export async function POST() {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return run();
}

async function run() {
  try {
    const result = await importCompetitorIdeas(createServiceClient());
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
