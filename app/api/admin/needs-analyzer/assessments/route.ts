import { NextResponse } from "next/server";
import { isOperator } from "@/lib/modules/adminGuard";
import { listAssessments, naDb } from "@/lib/needsAnalyzer/db";

// Operator-only: list assessments / start a new one.
export const runtime = "nodejs";

export async function GET() {
  if (!(await isOperator())) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  return NextResponse.json(await listAssessments(naDb()));
}

export async function POST() {
  if (!(await isOperator())) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const { data, error } = await naDb().from("vw_na_assessments").insert({ status: "Draft" }).select("id").single();
  if (error || !data) return NextResponse.json({ error: "Couldn't create the assessment" }, { status: 500 });
  return NextResponse.json({ id: data.id });
}
