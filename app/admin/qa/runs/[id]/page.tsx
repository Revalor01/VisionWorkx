import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isOperator } from "@/lib/modules/adminGuard";
import { qaDb, type QaResult, type QaRun, type QaTest } from "@/lib/qa/db";
import { isStale } from "@/lib/qa/summary";
import { duration, NotConfigured, QaShell, SECTION, StatusBadge, timeAgo } from "../../ui";
import AutoRefresh from "./AutoRefresh";

export const dynamic = "force-dynamic";

// One run: every test's result, with the error, failing step and
// screenshot/video/trace for anything that failed. Refreshes while running.
export default async function QaRunPage(props: { params: Promise<{ id: string }> }) {
  if (!(await isOperator())) redirect("/dashboard");
  const { id } = await props.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = qaDb();
  const { data: run, error } = await db.from("vw_qa_runs").select("*").eq("id", id).maybeSingle<QaRun>();
  if (error) {
    return (
      <QaShell>
        <NotConfigured what="The QA tables aren't in the database yet" />
      </QaShell>
    );
  }
  if (!run) notFound();

  const [{ data: results }, { data: tests }] = await Promise.all([
    db.from("vw_qa_results").select("*").eq("run_id", id).order("created_at"),
    db.from("vw_qa_tests").select("id, area, title").eq("product_slug", run.product_slug),
  ]);
  const titles = new Map(((tests ?? []) as Pick<QaTest, "id" | "area" | "title">[]).map((t) => [t.id, t]));
  const all = (results ?? []) as QaResult[];
  // Failures first, then by area.
  const rank = (s: QaResult["status"]) => (s === "failed" || s === "timed_out" ? 0 : s === "flaky" ? 1 : s === "passed" ? 2 : 3);
  const sorted = [...all].sort(
    (a, b) =>
      rank(a.status) - rank(b.status) ||
      (titles.get(a.test_id)?.area ?? "").localeCompare(titles.get(b.test_id)?.area ?? "") ||
      a.test_id.localeCompare(b.test_id) ||
      a.attempt - b.attempt,
  );
  const live = run.status === "queued" || run.status === "running";
  const stale = isStale(run);
  const artifact = (path: string) => `/api/admin/qa/artifact?path=${encodeURIComponent(path)}`;

  return (
    <QaShell>
      {live && !stale && <AutoRefresh seconds={5} />}
      <div className={SECTION}>
        <Link href={`/admin/qa/${run.product_slug}`} className="text-sm text-zinc-500 hover:underline">
          ← {run.product_slug}
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-navy-dark">Run {run.selection === "custom" ? `(${run.test_ids.length} picked)` : `(${run.selection})`}</h1>
          <StatusBadge status={stale ? "stale" : run.status} />
        </div>
        <p className="mt-1 text-sm text-zinc-500">
          {run.target_url} · started {timeAgo(run.created_at)} by {run.started_by ?? "—"}
          {run.github_run_url && (
            <>
              {" · "}
              <a href={run.github_run_url} target="_blank" rel="noopener noreferrer" className="text-navy hover:underline">
                GitHub Actions log →
              </a>
            </>
          )}
        </p>

        <div className="mt-4 flex gap-6 text-sm">
          <span className="font-semibold text-emerald-700">{run.passed} passed</span>
          <span className="font-semibold text-red-700">{run.failed} failed</span>
          <span className="text-zinc-500">{run.skipped} skipped</span>
        </div>

        {run.status === "queued" && !stale && <p className="mt-4 text-sm text-zinc-600">Waiting for GitHub Actions to pick this up (usually under a minute)…</p>}
        {run.status === "running" && <p className="mt-4 text-sm text-zinc-600">Running — results appear as each test finishes.</p>}
        {stale && (
          <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            This run never reported back. Check the QA workflow in GitHub Actions — it may have failed to start, or the runner&apos;s secrets
            aren&apos;t set.
          </p>
        )}
        {run.error && <p className="mt-4 whitespace-pre-wrap rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{run.error}</p>}
      </div>

      <ul className={`${SECTION} space-y-3`}>
        {sorted.map((r) => {
          const t = titles.get(r.test_id);
          const bad = r.status === "failed" || r.status === "timed_out";
          return (
            <li key={r.id} className={`rounded-2xl border bg-white p-4 ${bad ? "border-red-200" : "border-zinc-200"}`}>
              <details open={bad}>
                <summary className="flex cursor-pointer flex-wrap items-center gap-3">
                  <StatusBadge status={r.status} />
                  <span className="text-xs uppercase text-zinc-400">{t?.area ?? ""}</span>
                  <span className="font-medium text-zinc-900">{t?.title ?? r.test_id}</span>
                  {r.attempt > 1 && <span className="text-xs text-zinc-500">attempt {r.attempt}</span>}
                  <span className="ml-auto text-xs text-zinc-500">{duration(r.duration_ms)}</span>
                </summary>
                <div className="mt-3 space-y-3 pl-1">
                  <p className="text-xs text-zinc-400">{r.test_id}</p>
                  {r.error_step && (
                    <p className="text-sm text-zinc-700">
                      <span className="font-semibold">Failed at:</span> {r.error_step}
                    </p>
                  )}
                  {r.error_message && (
                    <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-zinc-900 p-3 text-xs text-zinc-100">{r.error_message}</pre>
                  )}
                  {r.screenshot_path && (
                    <a href={artifact(r.screenshot_path)} target="_blank" rel="noopener noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL via redirect */}
                      <img src={artifact(r.screenshot_path)} alt={`Screenshot when "${t?.title ?? r.test_id}" failed`} className="max-h-96 rounded-lg border border-zinc-200" />
                    </a>
                  )}
                  {r.video_path && (
                    <video controls preload="none" src={artifact(r.video_path)} className="max-h-96 w-full rounded-lg border border-zinc-200 bg-black" />
                  )}
                  {r.trace_path && (
                    <p className="text-sm">
                      <a href={artifact(r.trace_path)} className="text-navy hover:underline">
                        Download trace
                      </a>{" "}
                      <span className="text-zinc-500">
                        — open it at{" "}
                        <a href="https://trace.playwright.dev" target="_blank" rel="noopener noreferrer" className="hover:underline">
                          trace.playwright.dev
                        </a>{" "}
                        to step through every action.
                      </span>
                    </p>
                  )}
                </div>
              </details>
            </li>
          );
        })}
      </ul>
      {sorted.length === 0 && !live && <p className="mt-6 text-sm text-zinc-500">No test results were reported.</p>}
    </QaShell>
  );
}
