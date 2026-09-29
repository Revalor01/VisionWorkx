import { NextRequest, NextResponse } from "next/server";
import { isOperator } from "@/lib/modules/adminGuard";
import { naDb, UUID_RE } from "@/lib/needsAnalyzer/db";
import type { SiteReport } from "@/lib/needsAnalyzer/siteDetect";
import { reviewSite } from "@/lib/needsAnalyzer/siteReview";

// Operator-only: the optional "AI review" of a saved website check (Claude Haiku 4.5,
// ~1 cent, logged to ai_usage_log as needs_analyzer_site_review). Uses the page text
// saved with the check; doesn't fetch the site again.
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isOperator())) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const db = naDb();
  const { data: row } = await db.from("vw_na_site_checks").select("report").eq("id", id).maybeSingle();
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const review = await reviewSite(row.report as SiteReport);
  if (!review) return NextResponse.json({ error: "The AI review didn't work this time. Try again in a minute." }, { status: 502 });
  const { error } = await db.from("vw_na_site_checks").update({ ai_review: review }).eq("id", id);
  if (error) return NextResponse.json({ error: "Reviewed, but couldn't save it" }, { status: 500 });
  return NextResponse.json(review);
}
