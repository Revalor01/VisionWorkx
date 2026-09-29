import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { isOperator } from "@/lib/modules/adminGuard";
import { qaDb, type QaProduct, type QaRun } from "@/lib/qa/db";
import { isStale } from "@/lib/qa/summary";
import { NotConfigured, QaShell, StatusBadge, timeAgo } from "./ui";

export const dynamic = "force-dynamic";

// Every Revalor product under automated test, with its latest result.
export default async function QaProductsPage() {
  if (!(await isOperator())) redirect("/dashboard");
  const db = qaDb();
  const [{ data: products, error }, { data: runs }, { data: tests }] = await Promise.all([
    db.from("vw_qa_products").select("slug, name, base_url, enabled").order("name"),
    db.from("vw_qa_runs").select("id, product_slug, status, passed, failed, created_at, finished_at").order("created_at", { ascending: false }).limit(300),
    db.from("vw_qa_tests").select("product_slug").eq("active", true),
  ]);

  return (
    <QaShell>
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-navy-dark">Automated tests</h1>
          <Image
            src="/revalor-automation-suite-logo.png"
            alt="Revalor Automation"
            width={56}
            height={56}
            className="h-14 w-14 rounded-lg object-cover shadow-sm"
            priority
          />
        </div>
        <p className="mt-1 text-sm text-zinc-500">
          Real-browser tests for each Revalor product, run in GitHub Actions. Pick a product to choose tests, run them and see
          what broke.
        </p>
      </div>
      {error ? (
        <NotConfigured what="The QA tables aren't in the database yet" />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {((products ?? []) as QaProduct[]).map((p) => {
            const productRuns = ((runs ?? []) as Pick<QaRun, "id" | "product_slug" | "status" | "passed" | "failed" | "created_at" | "finished_at">[]).filter(
              (r) => r.product_slug === p.slug,
            );
            const last = productRuns[0];
            const finished = productRuns.filter((r) => r.status === "passed" || r.status === "failed").slice(0, 10);
            const passRate = finished.length ? Math.round((finished.filter((r) => r.status === "passed").length / finished.length) * 100) : null;
            const testCount = (tests ?? []).filter((t) => t.product_slug === p.slug).length;
            return (
              <Link
                key={p.slug}
                href={`/admin/qa/${p.slug}`}
                className="rounded-2xl border border-zinc-200 bg-white p-5 transition hover:border-zinc-400 hover:shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-lg font-bold text-zinc-900">{p.name}</h2>
                  <StatusBadge status={last ? (isStale(last) ? "stale" : last.status) : "never"} />
                </div>
                <p className="mt-1 truncate text-xs text-zinc-400">{p.base_url}</p>
                <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <div>
                    <dt className="text-xs text-zinc-500">Tests</dt>
                    <dd className="text-lg font-semibold text-zinc-900">{testCount}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-zinc-500">Pass rate</dt>
                    <dd className="text-lg font-semibold text-zinc-900">{passRate == null ? "—" : `${passRate}%`}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-zinc-500">Last run</dt>
                    <dd className="text-sm font-semibold text-zinc-900">{timeAgo(last?.created_at ?? null)}</dd>
                  </div>
                </dl>
                {!p.enabled && <p className="mt-3 text-xs text-amber-700">Disabled</p>}
              </Link>
            );
          })}
        </div>
      )}
      <p className="mt-8 text-xs text-zinc-400">
        Adding a product or test: see <code>docs/qa-suite.md</code>. New tests appear here after the next run.
      </p>
    </QaShell>
  );
}
