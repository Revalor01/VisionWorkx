import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { naDb, saveSetting } from "@/lib/needsAnalyzer/db";
import { decideSync, MAX_SYNC_ASSESSMENTS, parseLocalAssessment, type OnlineSyncRow, type SyncAction } from "@/lib/needsAnalyzer/sync";
import { isCatalog, isEcosystem, readJson } from "@/lib/needsAnalyzer/validate";

// The offline Needs Analyzer's data -> here. Called by scripts/needs-analyzer-sync.mjs
// on the laptop, never a browser. Auth: Authorization: Bearer NEEDS_ANALYZER_SYNC_SECRET
// (so the laptop never holds a database key).
// Body: { assessments: [<data/assessments/*.json>], catalog?, ecosystem? }
// Assessments are matched on local_id; lib/needsAnalyzer/sync.ts decides each one.
// catalog / ecosystem are only sent when the script is run with --settings, and
// replace the online copies.
export const runtime = "nodejs";

function authorized(req: NextRequest): boolean {
  const secret = process.env.NEEDS_ANALYZER_SYNC_SECRET;
  const got = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!secret || got.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(secret));
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: { assessments?: unknown; catalog?: unknown; ecosystem?: unknown };
  try {
    body = (await readJson(req, 8 * 1024 * 1024)) as typeof body;
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const raw = Array.isArray(body?.assessments) ? body.assessments : [];
  if (raw.length > MAX_SYNC_ASSESSMENTS) return NextResponse.json({ error: `At most ${MAX_SYNC_ASSESSMENTS} assessments per sync` }, { status: 400 });

  const db = naDb();
  const parsed = raw.map(parseLocalAssessment);
  const locals = parsed.filter((a) => a !== null);
  const invalid = parsed.length - locals.length;

  const existing = new Map<string, OnlineSyncRow>();
  if (locals.length) {
    const { data, error } = await db
      .from("vw_na_assessments")
      .select("id, local_id, updated_at, synced_at, deleted_at")
      .in(
        "local_id",
        locals.map((a) => a.id),
      );
    if (error) return NextResponse.json({ error: "Database error" }, { status: 500 });
    for (const r of data ?? []) existing.set(r.local_id as string, r as OnlineSyncRow);
  }

  const results: { id: string; bizName: string; action: SyncAction | "failed" }[] = [];
  for (const a of locals) {
    const online = existing.get(a.id);
    let action: SyncAction | "failed" = decideSync(a, online);
    const fields = { status: a.status, answers: a.answers, overrides: a.overrides, updated_at: a.updatedAt, synced_at: a.updatedAt };
    if (action === "insert") {
      const { error } = await db.from("vw_na_assessments").insert({ ...fields, local_id: a.id, created_at: a.createdAt });
      if (error) action = "failed";
    } else if (action === "update" && online) {
      // Only if nobody edited it online since we read it (otherwise it's a conflict now).
      const { data, error } = await db
        .from("vw_na_assessments")
        .update(fields)
        .eq("id", online.id)
        .eq("updated_at", online.updated_at)
        .is("deleted_at", null)
        .select("id");
      if (error) action = "failed";
      else if (!data?.length) action = "conflict";
    }
    results.push({ id: a.id, bizName: String(a.answers.bizName || "Untitled business"), action });
  }

  const settings: Record<string, "saved" | "invalid" | "failed"> = {};
  for (const key of ["catalog", "ecosystem"] as const) {
    const value = body[key];
    if (value === undefined) continue;
    if (!(key === "catalog" ? isCatalog(value) : isEcosystem(value))) settings[key] = "invalid";
    else settings[key] = (await saveSetting(db, key, value)).error ? "failed" : "saved";
  }

  return NextResponse.json({ results, invalid, settings });
}
