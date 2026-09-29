import { timingSafeEqual } from "crypto";
import { after, NextRequest, NextResponse } from "next/server";
import { QA_BUCKET, qaDb, type ResultStatus } from "@/lib/qa/db";
import { nightlyEmail, sendQaEmail } from "@/lib/qa/notify";
import { artifactPath, countResults, finalResults, finalRunStatus, PRODUCT_RE, stripAnsi, TEST_ID_RE } from "@/lib/qa/summary";

// The Playwright runner (GitHub Actions) reports here -- never a browser.
// Auth: Authorization: Bearer QA_REPORT_SECRET. Events:
//   catalog  every test in the code, per product (removed ones go inactive)
//   begin    run started (creates the run for scheduled runs with no run id)
//   result   one test attempt; returns signed upload URLs for its attachments
//   end      run finished; counts and status are recomputed from results
export const runtime = "nodejs";

function authorized(req: NextRequest): boolean {
  const secret = process.env.QA_REPORT_SECRET;
  const got = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!secret || got.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(secret));
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : null);
const strings = (v: unknown, max: number) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, max) : []);
const UUID_RE = /^[0-9a-f-]{36}$/i;
type Kind = "screenshot" | "trace" | "video";

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const db = qaDb();
  const now = new Date().toISOString();

  if (body.type === "catalog") {
    const product = str(body.product, 40);
    if (!product || !PRODUCT_RE.test(product) || !Array.isArray(body.tests)) return NextResponse.json({ error: "Bad catalog" }, { status: 400 });
    const rows = body.tests
      .slice(0, 1000)
      .map((t) => (t && typeof t === "object" ? (t as Record<string, unknown>) : {}))
      .filter((t) => typeof t.id === "string" && TEST_ID_RE.test(t.id) && t.id.startsWith(`${product}/`))
      .map((t) => ({
        id: t.id as string,
        product_slug: product,
        area: str(t.area, 60) || "General",
        title: str(t.title, 200) || (t.id as string),
        tags: strings(t.tags, 20),
        requires: strings(t.requires, 10),
        manual: t.manual === true,
        instructions: str(t.instructions, 2000),
        active: true,
        last_synced_at: now,
      }));
    if (rows.length) {
      const { error } = await db.from("vw_qa_tests").upsert(rows, { onConflict: "id" });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
    // Tests this product no longer defines keep their history but are hidden.
    await db.from("vw_qa_tests").update({ active: false }).eq("product_slug", product).lt("last_synced_at", now);
    return NextResponse.json({ ok: true, synced: rows.length });
  }

  if (body.type === "begin") {
    const githubRunUrl = str(body.githubRunUrl, 300);
    const runId = str(body.runId, 36);
    if (runId && UUID_RE.test(runId)) {
      await db.from("vw_qa_runs").update({ status: "running", started_at: now, github_run_url: githubRunUrl }).eq("id", runId).in("status", ["queued", "running"]);
      return NextResponse.json({ runId });
    }
    // Scheduled (nightly) run: there's no row yet.
    const product = str(body.product, 40);
    const targetUrl = str(body.targetUrl, 300);
    if (!product || !PRODUCT_RE.test(product) || !targetUrl?.startsWith("https://")) return NextResponse.json({ error: "Bad begin" }, { status: 400 });
    const { data, error } = await db
      .from("vw_qa_runs")
      .insert({
        product_slug: product,
        target_env: body.targetEnv === "preview" ? "preview" : "production",
        target_url: targetUrl,
        selection: "nightly",
        started_by: "schedule",
        status: "running",
        started_at: now,
        github_run_url: githubRunUrl,
      })
      .select("id")
      .single();
    if (error || !data) return NextResponse.json({ error: error?.message ?? "insert failed" }, { status: 500 });
    return NextResponse.json({ runId: data.id });
  }

  if (body.type === "result") {
    const runId = str(body.runId, 36);
    const testId = str(body.testId, 200);
    if (!runId || !UUID_RE.test(runId) || !testId || !TEST_ID_RE.test(testId)) return NextResponse.json({ error: "Bad result" }, { status: 400 });
    const status = ["passed", "failed", "skipped", "timed_out", "flaky"].includes(body.status as string) ? (body.status as string) : "failed";
    const attempt = typeof body.attempt === "number" && body.attempt >= 1 && body.attempt <= 10 ? Math.floor(body.attempt) : 1;
    const kinds = new Set(strings(body.attachments, 3).filter((k): k is Kind => k === "screenshot" || k === "trace" || k === "video"));
    const paths: Partial<Record<Kind, string>> = {};
    for (const k of kinds) paths[k] = artifactPath(runId, testId, attempt, k);

    const { error } = await db.from("vw_qa_results").upsert(
      {
        run_id: runId,
        test_id: testId,
        status,
        attempt,
        duration_ms: typeof body.durationMs === "number" ? Math.round(body.durationMs) : null,
        error_message: body.errorMessage ? stripAnsi(String(body.errorMessage)).slice(0, 4000) : null,
        error_step: str(body.errorStep, 300),
        screenshot_path: paths.screenshot ?? null,
        trace_path: paths.trace ?? null,
        video_path: paths.video ?? null,
      },
      { onConflict: "run_id,test_id,attempt" },
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const uploads: Partial<Record<Kind, string>> = {};
    for (const [k, path] of Object.entries(paths) as [Kind, string][]) {
      const { data } = await db.storage.from(QA_BUCKET).createSignedUploadUrl(path, { upsert: true });
      if (data?.signedUrl) uploads[k] = data.signedUrl;
    }
    // Keep the live counts moving while the run is in progress.
    const { data: all } = await db.from("vw_qa_results").select("test_id, status, attempt").eq("run_id", runId);
    await db.from("vw_qa_runs").update(countResults(all ?? [])).eq("id", runId);
    return NextResponse.json({ ok: true, uploads });
  }

  if (body.type === "end") {
    const runId = str(body.runId, 36);
    if (!runId || !UUID_RE.test(runId)) return NextResponse.json({ error: "Bad end" }, { status: 400 });
    const { data: all } = await db.from("vw_qa_results").select("test_id, status, attempt").eq("run_id", runId);
    const counts = countResults(all ?? []);
    const runnerError = str(body.error, 2000);
    const status = runnerError && counts.passed + counts.failed === 0 ? "error" : finalRunStatus(counts, str(body.status, 20) ?? undefined);
    const { data: finished } = await db
      .from("vw_qa_runs")
      .update({ ...counts, status, error: runnerError, finished_at: now })
      .eq("id", runId)
      .in("status", ["queued", "running"])
      .select("id, product_slug, selection, created_at")
      .maybeSingle();

    // Nightly runs email the operator on failure (and once when back to green).
    // Only on the first "end" for the run -- a repeat from the workflow's
    // failure step doesn't match the status filter above.
    if (finished?.selection === "nightly") {
      const origin = req.nextUrl.origin;
      after(async () => {
        const failedIds = finalResults((all ?? []) as { test_id: string; status: ResultStatus; attempt: number }[])
          .filter((r) => r.status === "failed" || r.status === "timed_out")
          .map((r) => r.test_id);
        const [{ data: steps }, { data: titles }, { data: prev }] = await Promise.all([
          failedIds.length
            ? db.from("vw_qa_results").select("test_id, error_step, attempt").eq("run_id", runId).in("test_id", failedIds).order("attempt", { ascending: false })
            : Promise.resolve({ data: [] as { test_id: string; error_step: string | null }[] }),
          failedIds.length ? db.from("vw_qa_tests").select("id, title").in("id", failedIds) : Promise.resolve({ data: [] as { id: string; title: string }[] }),
          db
            .from("vw_qa_runs")
            .select("status")
            .eq("product_slug", finished.product_slug)
            .eq("selection", "nightly")
            .lt("created_at", finished.created_at)
            .not("finished_at", "is", null)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);
        const email = nightlyEmail(
          { id: runId, product_slug: finished.product_slug, status, ...counts, error: runnerError },
          failedIds.map((id) => ({
            title: titles?.find((t) => t.id === id)?.title ?? id,
            error_step: steps?.find((s) => s.test_id === id)?.error_step ?? null,
          })),
          prev?.status ?? null,
          `${origin}/admin/qa/runs/${runId}`,
        );
        if (email) await sendQaEmail(email);
      });
    }
    return NextResponse.json({ ok: true, status });
  }

  return NextResponse.json({ error: "Unknown event" }, { status: 400 });
}
