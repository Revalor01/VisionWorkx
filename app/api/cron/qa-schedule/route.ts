import { NextRequest, NextResponse } from "next/server";
import { qaDb, type QaProduct } from "@/lib/qa/db";
import { dispatchQaRun, qaDispatchConfigured } from "@/lib/qa/github";
import { effectiveCadence, isDue } from "@/lib/qa/schedule";
import { loadSchedule } from "@/lib/qa/scheduleDb";

export const runtime = "nodejs";
export const maxDuration = 60;

// Daily: dispatch each enabled product's full QA run when its cadence says it's
// due. The cadence comes from vw_qa_schedule (global default + per-product
// overrides, set at /admin/qa). This replaces the fixed nightly schedule that
// used to live in qa-run.yml — the workflow now only runs on dispatch.
//
// Runs are recorded with selection 'nightly' and started_by 'schedule', so the
// report route's nightly-email path (failure + back-to-green) still applies.
export async function GET(req: NextRequest) {
  if ((req.headers.get("authorization") ?? "") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!qaDispatchConfigured()) {
    return NextResponse.json({ error: "QA_GITHUB_TOKEN isn't set." }, { status: 503 });
  }

  const db = qaDb();
  const [{ global, overrides }, { data: products }] = await Promise.all([
    loadSchedule(),
    db.from("vw_qa_products").select("slug, name, base_url, enabled").eq("enabled", true),
  ]);

  const dispatched: string[] = [];
  const skipped: { slug: string; reason: string }[] = [];

  for (const p of (products ?? []) as QaProduct[]) {
    const cadence = effectiveCadence(overrides[p.slug], global);
    if (cadence === "off") {
      skipped.push({ slug: p.slug, reason: "off" });
      continue;
    }

    // When did this product last run on a schedule?
    const { data: last } = await db
      .from("vw_qa_runs")
      .select("created_at")
      .eq("product_slug", p.slug)
      .eq("started_by", "schedule")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!isDue(cadence, last?.created_at ?? null)) {
      skipped.push({ slug: p.slug, reason: "not due" });
      continue;
    }

    // Don't pile up behind a run that's still going.
    const { data: active } = await db
      .from("vw_qa_runs")
      .select("id")
      .eq("product_slug", p.slug)
      .in("status", ["queued", "running"])
      .limit(1)
      .maybeSingle();
    if (active) {
      skipped.push({ slug: p.slug, reason: "in flight" });
      continue;
    }

    const { data: run, error } = await db
      .from("vw_qa_runs")
      .insert({
        product_slug: p.slug,
        target_env: "production",
        target_url: p.base_url,
        selection: "nightly",
        test_ids: [],
        started_by: "schedule",
      })
      .select("id")
      .single();
    if (error || !run) {
      console.error("[qa] scheduled run insert failed:", p.slug, error?.code, error?.message);
      skipped.push({ slug: p.slug, reason: "insert failed" });
      continue;
    }

    // Empty grep = the full suite (onDemand tests skip themselves nightly).
    const d = await dispatchQaRun({ runId: run.id, product: p.slug, targetUrl: p.base_url, targetEnv: "production", grep: "" });
    if (!d.ok) {
      await db.from("vw_qa_runs").update({ status: "error", error: d.error, finished_at: new Date().toISOString() }).eq("id", run.id);
      skipped.push({ slug: p.slug, reason: `dispatch: ${d.error}` });
      continue;
    }
    dispatched.push(p.slug);
  }

  return NextResponse.json({ ok: true, dispatched, skipped });
}
