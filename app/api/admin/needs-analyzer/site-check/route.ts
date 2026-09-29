import { NextRequest, NextResponse } from "next/server";
import { isOperator } from "@/lib/modules/adminGuard";
import { naDb, UUID_RE } from "@/lib/needsAnalyzer/db";
import { runSiteCheck } from "@/lib/needsAnalyzer/siteCheck";
import { SITE_CHECK_COLUMNS, toSiteCheck, type SiteCheckRow } from "@/lib/needsAnalyzer/siteChecks";
import { SiteFetchError } from "@/lib/needsAnalyzer/siteFetch";
import { readJson } from "@/lib/needsAnalyzer/validate";

// Operator-only: check a website and save the result (optionally linked to an assessment).
// Body: { url, assessmentId? }. The fetcher refuses private/internal addresses.
export const runtime = "nodejs";
export const maxDuration = 60; // home page + up to 5 pages, PageSpeed in parallel

export async function POST(req: NextRequest) {
  if (!(await isOperator())) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  let body: { url?: unknown; assessmentId?: unknown };
  try {
    body = (await readJson(req, 8 * 1024)) as typeof body;
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  if (typeof body?.url !== "string") return NextResponse.json({ error: "Enter a website address" }, { status: 400 });
  const assessmentId = typeof body.assessmentId === "string" && UUID_RE.test(body.assessmentId) ? body.assessmentId : null;

  let result;
  try {
    result = await runSiteCheck(body.url);
  } catch (e) {
    if (e instanceof SiteFetchError) return NextResponse.json({ error: e.message }, { status: 422 });
    console.error("[site-check] failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "The check failed. Try again." }, { status: 500 });
  }

  const { data, error } = await naDb()
    .from("vw_na_site_checks")
    .insert({
      url: result.report.inputUrl,
      final_url: result.report.finalUrl,
      assessment_id: assessmentId,
      report: result.report,
      pagespeed: result.pagespeed,
    })
    .select(SITE_CHECK_COLUMNS)
    .single();
  if (error || !data) return NextResponse.json({ error: "Checked, but couldn't save the result" }, { status: 500 });
  return NextResponse.json(toSiteCheck(data as SiteCheckRow));
}
