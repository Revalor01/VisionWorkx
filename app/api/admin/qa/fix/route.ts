import { NextRequest, NextResponse } from "next/server";
import { isOperator } from "@/lib/modules/adminGuard";
import { qaDb, type QaResult, type QaRun } from "@/lib/qa/db";
import { dispatchQaFix, qaFixConfigured } from "@/lib/qa/fixDispatch";
import { repoFor } from "@/lib/qa/fixRepos";

// Operator clicks "Fix this" on a failing test: hand the failure to the qa-fix
// workflow (revalor-agents), which runs an AI agent against that product's repo
// and opens a DRAFT PR for review. Nothing is merged.
export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f-]{36}$/i;

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (origin && origin !== req.nextUrl.origin) return NextResponse.json({ error: "Bad origin" }, { status: 403 });
  if (!(await isOperator())) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  if (!qaFixConfigured()) return NextResponse.json({ error: "QA_FIX_TOKEN isn't set in Vercel yet." }, { status: 503 });

  let body: { runId?: unknown; resultId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const runId = typeof body.runId === "string" && UUID_RE.test(body.runId) ? body.runId : null;
  const resultId = typeof body.resultId === "string" && UUID_RE.test(body.resultId) ? body.resultId : null;
  if (!runId || !resultId) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  const db = qaDb();
  const { data: result } = await db
    .from("vw_qa_results")
    .select("id, run_id, test_id, status, error_message, error_step")
    .eq("id", resultId)
    .eq("run_id", runId)
    .maybeSingle<Pick<QaResult, "id" | "run_id" | "test_id" | "status" | "error_message" | "error_step">>();
  if (!result) return NextResponse.json({ error: "Test result not found." }, { status: 404 });
  if (result.status !== "failed" && result.status !== "timed_out") {
    return NextResponse.json({ error: "Only failing tests can be fixed." }, { status: 400 });
  }

  const { data: run } = await db.from("vw_qa_runs").select("id, product_slug").eq("id", runId).maybeSingle<Pick<QaRun, "id" | "product_slug">>();
  if (!run) return NextResponse.json({ error: "Run not found." }, { status: 404 });

  const repo = repoFor(run.product_slug);
  if (!repo) return NextResponse.json({ error: `No repo is mapped for ${run.product_slug} (see lib/qa/fixRepos.ts).` }, { status: 400 });

  const { data: test } = await db.from("vw_qa_tests").select("title").eq("id", result.test_id).maybeSingle<{ title: string }>();

  const d = await dispatchQaFix({
    product: run.product_slug,
    repo,
    testId: result.test_id,
    testTitle: test?.title ?? result.test_id,
    errorMessage: result.error_message ?? "",
    errorStep: result.error_step ?? "",
    runUrl: `${req.nextUrl.origin}/admin/qa/runs/${runId}`,
  });
  if (!d.ok) return NextResponse.json({ error: d.error }, { status: 502 });

  return NextResponse.json({ ok: true, repo, prsUrl: `https://github.com/${repo}/pulls` });
}
