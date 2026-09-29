"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { fmtDate } from "@/lib/needsAnalyzer/format";
import { ecoCoverage } from "@/lib/needsAnalyzer/rules";
import type { AssessmentSummary, Catalog, Ecosystem } from "@/lib/needsAnalyzer/types";
import { api, Badge, BTN, BTN_DANGER, BTN_PRIMARY, CARD, NaShell, statusTone, useClientMode, useToast } from "./ui";

export default function Home(props: { initial: AssessmentSummary[]; catalog: Catalog; ecosystem: Ecosystem }) {
  return (
    <NaShell active="home">
      <HomeBody {...props} />
    </NaShell>
  );
}

function HomeBody({ initial, catalog, ecosystem }: { initial: AssessmentSummary[]; catalog: Catalog; ecosystem: Ecosystem }) {
  const router = useRouter();
  const toast = useToast();
  const { on: clientMode } = useClientMode();
  const [list, setList] = useState(initial);
  const [busy, setBusy] = useState(false);
  const gaps = ecoCoverage(catalog, ecosystem).filter((c) => c.status !== "ready");

  async function create() {
    setBusy(true);
    try {
      const { id } = await api<{ id: string }>("POST", "/api/admin/needs-analyzer/assessments");
      router.push(`/admin/needs-analyzer/${id}`);
    } catch (e) {
      toast((e as Error).message);
      setBusy(false);
    }
  }

  async function remove(a: AssessmentSummary) {
    if (!confirm(`Delete the assessment for "${a.bizName}"? Its proposal link stops working too.`)) return;
    try {
      await api("DELETE", `/api/admin/needs-analyzer/assessments/${a.id}`);
      setList((l) => l.filter((x) => x.id !== a.id));
      toast("Deleted");
    } catch (e) {
      toast((e as Error).message);
    }
  }

  const link = (a: AssessmentSummary, tab?: string) => `/admin/needs-analyzer/${a.id}${tab ? `?tab=${tab}` : ""}`;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Assessments</h1>
          <p className="text-sm text-zinc-500">Each business you meet gets a questionnaire, a build plan and a proposal.</p>
        </div>
        <button type="button" className={BTN_PRIMARY} onClick={create} disabled={busy}>
          {busy ? "Creating…" : "+ New assessment"}
        </button>
      </div>

      <div className={CARD}>
        {list.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
                  <th className="py-2 pr-3">Business</th>
                  <th className="py-2 pr-3">Industry</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Updated</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {list.map((a) => (
                  <tr key={a.id} className="border-b border-zinc-100">
                    <td className="py-2 pr-3">
                      <Link href={link(a)} className="font-semibold text-teal-700 hover:underline">
                        {a.bizName}
                      </Link>
                      {!clientMode && (
                        <span className="ml-2 inline-flex gap-1">
                          {a.fromOffline && <Badge title="Synced from the offline laptop app">from laptop</Badge>}
                          {a.shareEnabled && (
                            <Badge tone="accent" title="The client proposal link is on">
                              link on
                            </Badge>
                          )}
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-zinc-500">{a.industry}</td>
                    <td className="py-2 pr-3">
                      <Badge tone={statusTone(a.status)}>{a.status}</Badge>
                    </td>
                    <td className="whitespace-nowrap py-2 pr-3 text-zinc-500">{fmtDate(a.updatedAt)}</td>
                    <td className="whitespace-nowrap py-2 text-right">
                      <span className="inline-flex gap-2">
                        <Link className={BTN} href={link(a, "plan")}>
                          Plan
                        </Link>
                        <Link className={BTN} href={link(a, "proposal")}>
                          Proposal
                        </Link>
                        {!clientMode && (
                          <button type="button" className={BTN_DANGER} onClick={() => remove(a)}>
                            Delete
                          </button>
                        )}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-10 text-center">
            <p className="mb-3 text-zinc-500">No assessments yet.</p>
            <button type="button" className={BTN_PRIMARY} onClick={create} disabled={busy}>
              Start your first assessment
            </button>
          </div>
        )}
      </div>

      {!clientMode && gaps.length > 0 && (
        <div className={CARD}>
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-zinc-900">Ecosystem gaps</h3>
            <Link href="/admin/needs-analyzer/ecosystem" className="text-sm text-teal-700 hover:underline">
              Open ecosystem →
            </Link>
          </div>
          <p className="mt-1 text-sm text-zinc-500">Capabilities your recommended modules depend on that are not confirmed in the Revalor / VisionWorkx stack.</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {gaps.map((g) => (
              <Badge key={g.id} tone={g.status === "gap" ? "bad" : "warn"}>
                {g.name}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {!clientMode && (
        <div className={CARD}>
          <h3 className="font-semibold text-zinc-900">Syncing from the offline laptop app</h3>
          <p className="mt-1 text-sm text-zinc-600">
            Assessments made offline in the laptop app come here when you run the sync script on the laptop once it&apos;s back online:
          </p>
          <pre className="mt-2 overflow-x-auto rounded-md bg-zinc-900 px-3 py-2 text-xs text-zinc-100">node needs-analyzer-sync.mjs ~/Documents/revalor-needs-analyzer</pre>
          <p className="mt-2 text-sm text-zinc-500">
            New and laptop-edited assessments are added or updated; anything edited here since the last sync is kept and listed, never overwritten. Add{" "}
            <code>--settings</code> to also copy the laptop&apos;s catalog and ecosystem here. The script is <code>scripts/needs-analyzer-sync.mjs</code> in the
            VisionWorkx repo.
          </p>
        </div>
      )}
    </>
  );
}
