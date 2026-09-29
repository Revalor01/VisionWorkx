import { NextRequest, NextResponse } from "next/server";
import { isOperator } from "@/lib/modules/adminGuard";
import { listAssessments, naDb } from "@/lib/needsAnalyzer/db";
import { parseAssessmentPatch, readJson } from "@/lib/needsAnalyzer/validate";

// Operator-only: list assessments / start a new one (optionally with answers
// already filled in, e.g. from a website check).
export const runtime = "nodejs";

export async function GET() {
  if (!(await isOperator())) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  return NextResponse.json(await listAssessments(naDb()));
}

export async function POST(req: NextRequest) {
  if (!(await isOperator())) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  let answers = {};
  if (Number(req.headers.get("content-length") || 0) > 0) {
    let patch;
    try {
      patch = parseAssessmentPatch(await readJson(req));
    } catch {
      patch = null;
    }
    if (!patch) return NextResponse.json({ error: "Bad request" }, { status: 400 });
    answers = patch.answers ?? {};
  }
  const { data, error } = await naDb().from("vw_na_assessments").insert({ status: "Draft", answers }).select("id").single();
  if (error || !data) return NextResponse.json({ error: "Couldn't create the assessment" }, { status: 500 });
  return NextResponse.json({ id: data.id });
}
