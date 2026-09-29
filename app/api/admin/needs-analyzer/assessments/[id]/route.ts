import { NextRequest, NextResponse } from "next/server";
import { isOperator } from "@/lib/modules/adminGuard";
import { getAssessment, naDb, UUID_RE } from "@/lib/needsAnalyzer/db";
import { parseAssessmentPatch, readJson } from "@/lib/needsAnalyzer/validate";

// Operator-only: read, autosave, or delete one assessment. Delete is soft (sets
// deleted_at, recoverable in the database like the offline app's data/trash).
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  if (!(await isOperator())) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const a = await getAssessment(naDb(), (await params).id);
  return a ? NextResponse.json(a) : NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  if (!(await isOperator())) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  let patch;
  try {
    patch = parseAssessmentPatch(await readJson(req));
  } catch {
    patch = null;
  }
  if (!patch) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const updatedAt = new Date().toISOString();
  const { data, error } = await naDb()
    .from("vw_na_assessments")
    .update({ ...patch, updated_at: updatedAt })
    .eq("id", id)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Save failed" }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, updatedAt });
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  if (!(await isOperator())) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // Deleting also turns sharing off, so a deleted proposal's link stops working.
  const { error } = await naDb()
    .from("vw_na_assessments")
    .update({ deleted_at: new Date().toISOString(), share_enabled: false })
    .eq("id", id)
    .is("deleted_at", null);
  if (error) return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
