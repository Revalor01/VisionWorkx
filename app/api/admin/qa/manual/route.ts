import { NextRequest, NextResponse } from "next/server";
import { isOperator } from "@/lib/modules/adminGuard";
import { ADMIN_EMAIL } from "@/lib/adminSso";
import { qaDb } from "@/lib/qa/db";
import { TEST_ID_RE } from "@/lib/qa/summary";

// Operator records the result of a manual check from /admin/qa.
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (origin && origin !== req.nextUrl.origin) return NextResponse.json({ error: "Bad origin" }, { status: 403 });
  if (!(await isOperator())) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  let body: { testId?: unknown; status?: unknown; note?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const testId = typeof body.testId === "string" && TEST_ID_RE.test(body.testId) ? body.testId : null;
  const status = body.status === "passed" || body.status === "failed" || body.status === "skipped" ? body.status : null;
  if (!testId || !status) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 2000) || null : null;

  const db = qaDb();
  const { data: t } = await db.from("vw_qa_tests").select("id").eq("id", testId).eq("manual", true).maybeSingle();
  if (!t) return NextResponse.json({ error: "Unknown manual check." }, { status: 404 });
  const { data, error } = await db
    .from("vw_qa_manual_checks")
    .insert({ test_id: testId, status, note, checked_by: ADMIN_EMAIL })
    .select("id, test_id, status, note, checked_by, created_at")
    .single();
  if (error) return NextResponse.json({ error: "Couldn't save." }, { status: 500 });
  return NextResponse.json({ check: data });
}
