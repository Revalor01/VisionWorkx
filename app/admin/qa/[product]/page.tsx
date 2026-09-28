import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isOperator } from "@/lib/modules/adminGuard";
import { qaDb, type QaProduct, type QaResult, type QaRun, type QaTest } from "@/lib/qa/db";
import { finalResults, isStale, PRODUCT_RE } from "@/lib/qa/summary";
import { qaDispatchConfigured } from "@/lib/qa/github";
import { NotConfigured, QaShell, StatusBadge, timeAgo } from "../ui";
import TestPicker from "./TestPicker";

export const dynamic = "force-dynamic";

// One product: pick tests and run them; recent runs below.
export default async function QaProductPage(props: { params: Promise<{ product: string }> }) {
  if (!(await isOperator())) redirect("/dashboard");
  const { product } = await props.params;
  if (!PRODUCT_RE.test(product)) notFound();
  const db = qaDb();
  const { data: p, error } = await db.from("vw_qa_products").select("slug, name, base_url, enabled").eq("slug", product).maybeSingle<QaProduct>();
  if (error) {
    return (
      <QaShell>
        <NotConfigured what="The QA tables aren't in the database yet" />
      </QaShell>
    );
  }
  if (!p) notFound();

  const [{ data: tests }, { data: runs }] = await Promise.all([
    db.from("vw_qa_tests").select("id, product_slug, area, title, tags, requires, manual, active").eq("product_slug", product).eq("active", true).order("area").order("title"),
    db.from("vw_qa_runs").select("*").eq("product_slug", product).order("created_at", { ascending: false }).limit(25),
  ]);
  const runList = (runs ?? []) as QaRun[];
  const testList = ((tests ?? []) as QaTest[]).filter((t) => !t.manual);

  // Latest status per test, from the most recent runs.
  const { data: recent } = runList.length
    ? await db
        .from("vw_qa_results")
        .select("run_id, test_id, status, attempt, created_at")
        .in("run_id", runList.map((r) => r.id))
        .order("created_at", { ascending: false })
    : { data: [] };
  const lastStatus: Record<string, QaResult["status"]> = {};
  for (const run of runList) {
    for (const r of finalResults(((recent ?? []) as QaResult[]).filter((x) => x.run_id === run.id))) {
      if (!(r.test_id in lastStatus)) lastStatus[r.test_id] = r.status;
    }
  }

  return (
    <QaShell>
      <div className="mb-6">
        <Link href="/admin/qa" className="text-sm text-zinc-500 hover:underline">
          ← All products
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-navy-dark">{p.name}</h1>
        <p className="text-sm text-zinc-500">Production: {p.base_url}</p>
      </div>

      <TestPicker
        product={p.slug}
        productionUrl={p.base_url}
        tests={testList.map((t) => ({ id: t.id, area: t.area, title: t.title, tags: t.tags, requires: t.requires, last: lastStatus[t.id] ?? null }))}
        dispatchReady={qaDispatchConfigured()}
      />

      <section className="mt-10">
        <h2 className="mb-3 text-lg font-bold text-zinc-900">Recent runs</h2>
        {runList.length === 0 ? (
          <p className="text-sm text-zinc-500">No runs yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-zinc-200 text-xs uppercase text-zinc-500">
                <tr>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Which</th>
                  <th className="px-4 py-2">Result</th>
                  <th className="px-4 py-2">Target</th>
                  <th className="px-4 py-2">Started</th>
                </tr>
              </thead>
              <tbody>
                {runList.map((r) => (
                  <tr key={r.id} className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50">
                    <td className="px-4 py-2">
                      <Link href={`/admin/qa/runs/${r.id}`}>
                        <StatusBadge status={isStale(r) ? "stale" : r.status} />
                      </Link>
                    </td>
                    <td className="px-4 py-2">
                      <Link href={`/admin/qa/runs/${r.id}`} className="text-navy hover:underline">
                        {r.selection === "custom" ? `${r.test_ids.length} picked` : r.selection}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-zinc-600">
                      {r.passed} passed{r.failed ? <span className="text-red-700"> · {r.failed} failed</span> : null}
                      {r.skipped ? ` · ${r.skipped} skipped` : null}
                    </td>
                    <td className="px-4 py-2 text-zinc-500">{r.target_env}</td>
                    <td className="px-4 py-2 text-zinc-500">
                      {timeAgo(r.created_at)}
                      {r.started_by === "schedule" ? " (nightly)" : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </QaShell>
  );
}
