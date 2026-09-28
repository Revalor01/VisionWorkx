import { NextRequest, NextResponse } from "next/server";
import { isOperator } from "@/lib/modules/adminGuard";
import { ADMIN_EMAIL } from "@/lib/adminSso";
import { qaDb, type QaProduct } from "@/lib/qa/db";
import { dispatchQaRun, qaDispatchConfigured } from "@/lib/qa/github";
import { grepFor, PRODUCT_RE, TEST_ID_RE } from "@/lib/qa/summary";

// Operator starts a QA run from /admin/qa: record it, then hand it to GitHub
// Actions. The runner reports back to /api/admin/qa/report.
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (origin && origin !== req.nextUrl.origin) return NextResponse.json({ error: "Bad origin" }, { status: 403 });
  if (!(await isOperator())) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  if (!qaDispatchConfigured()) return NextResponse.json({ error: "QA_GITHUB_TOKEN isn't set in Vercel yet." }, { status: 503 });

  let body: { product?: unknown; selection?: unknown; testIds?: unknown; targetEnv?: unknown; targetUrl?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const product = typeof body.product === "string" && PRODUCT_RE.test(body.product) ? body.product : null;
  const selection = body.selection === "smoke" || body.selection === "all" || body.selection === "custom" ? body.selection : null;
  const targetEnv = body.targetEnv === "preview" ? "preview" : "production";
  const testIds = Array.isArray(body.testIds)
    ? body.testIds.filter((t): t is string => typeof t === "string" && TEST_ID_RE.test(t)).slice(0, 200)
    : [];
  if (!product || !selection) return NextResponse.json({ error: "Pick a product and which tests to run." }, { status: 400 });
  if (selection === "custom" && testIds.length === 0) return NextResponse.json({ error: "Tick at least one test." }, { status: 400 });

  const db = qaDb();
  const { data: p } = await db.from("vw_qa_products").select("slug, name, base_url, enabled").eq("slug", product).maybeSingle<QaProduct>();
  if (!p?.enabled) return NextResponse.json({ error: "Unknown product." }, { status: 404 });

  let targetUrl = p.base_url;
  if (targetEnv === "preview") {
    let u: URL | null = null;
    try {
      u = new URL(typeof body.targetUrl === "string" ? body.targetUrl.trim() : "");
    } catch {
      /* invalid */
    }
    if (!u || u.protocol !== "https:") return NextResponse.json({ error: "Enter the preview's https:// URL." }, { status: 400 });
    targetUrl = u.origin;
  }

  const { data: run, error } = await db
    .from("vw_qa_runs")
    .insert({ product_slug: product, target_env: targetEnv, target_url: targetUrl, selection, test_ids: testIds, started_by: ADMIN_EMAIL })
    .select("id")
    .single();
  if (error || !run) {
    console.error("[qa] run insert failed:", error?.code, error?.message);
    return NextResponse.json({ error: "Couldn't record the run." }, { status: 500 });
  }

  const d = await dispatchQaRun({ runId: run.id, product, targetUrl, targetEnv, grep: grepFor(selection, testIds) });
  if (!d.ok) {
    await db.from("vw_qa_runs").update({ status: "error", error: d.error, finished_at: new Date().toISOString() }).eq("id", run.id);
    return NextResponse.json({ error: d.error, runId: run.id }, { status: 502 });
  }
  return NextResponse.json({ runId: run.id });
}
