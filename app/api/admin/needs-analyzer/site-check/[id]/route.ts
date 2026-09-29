import { NextRequest, NextResponse } from "next/server";
import { isOperator } from "@/lib/modules/adminGuard";
import { getAssessment, naDb, UUID_RE } from "@/lib/needsAnalyzer/db";
import { readJson } from "@/lib/needsAnalyzer/validate";

// Operator-only: update a saved website check.
//   proposalIssues  issue ids to show on the client proposal (must be issues in this check)
//   assessmentId    link the check to an assessment (or null to unlink)
export const runtime = "nodejs";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isOperator())) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  let body: { proposalIssues?: unknown; assessmentId?: unknown };
  try {
    body = (await readJson(req, 16 * 1024)) as typeof body;
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const db = naDb();
  const { data: row } = await db.from("vw_na_site_checks").select("report").eq("id", id).maybeSingle();
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const patch: { proposal_issues?: string[]; assessment_id?: string | null } = {};
  if (body.proposalIssues !== undefined) {
    if (!Array.isArray(body.proposalIssues)) return NextResponse.json({ error: "Bad request" }, { status: 400 });
    const known = new Set(((row.report as { issues?: { id: string }[] }).issues ?? []).map((i) => i.id));
    patch.proposal_issues = [...new Set(body.proposalIssues.filter((x): x is string => typeof x === "string" && known.has(x)))];
  }
  if (body.assessmentId !== undefined) {
    if (body.assessmentId !== null && !(typeof body.assessmentId === "string" && UUID_RE.test(body.assessmentId)))
      return NextResponse.json({ error: "Bad request" }, { status: 400 });
    if (body.assessmentId !== null && !(await getAssessment(db, body.assessmentId as string)))
      return NextResponse.json({ error: "That assessment no longer exists" }, { status: 400 });
    patch.assessment_id = body.assessmentId as string | null;
  }
  if (!Object.keys(patch).length) return NextResponse.json({ error: "Nothing to change" }, { status: 400 });

  const { error } = await db.from("vw_na_site_checks").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: "Save failed" }, { status: 500 });
  return NextResponse.json({ ok: true, proposalIssues: patch.proposal_issues });
}
