"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Status = "passed" | "failed" | "skipped" | "timed_out" | "flaky";

interface PickerTest {
  id: string;
  area: string;
  title: string;
  tags: string[];
  requires: string[];
  last: Status | null;
}

const DOT: Record<Status, string> = {
  passed: "bg-emerald-500",
  flaky: "bg-amber-500",
  failed: "bg-red-500",
  timed_out: "bg-red-500",
  skipped: "bg-zinc-300",
};

export default function TestPicker({
  product,
  productionUrl,
  tests,
  dispatchReady,
}: {
  product: string;
  productionUrl: string;
  tests: PickerTest[];
  dispatchReady: boolean;
}) {
  const router = useRouter();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [targetEnv, setTargetEnv] = useState<"production" | "preview">("production");
  const [previewUrl, setPreviewUrl] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  const areas = useMemo(() => {
    const m = new Map<string, PickerTest[]>();
    for (const t of tests) m.set(t.area, [...(m.get(t.area) ?? []), t]);
    return [...m.entries()];
  }, [tests]);
  const smokeCount = tests.filter((t) => t.tags.includes("smoke")).length;
  const failing = tests.filter((t) => t.last === "failed" || t.last === "timed_out").map((t) => t.id);
  // Areas start collapsed, except any with a failing test.
  const [openAreas, setOpenAreas] = useState<Set<string>>(
    () => new Set(tests.filter((t) => t.last === "failed" || t.last === "timed_out").map((t) => t.area)),
  );

  function toggle(ids: string[], on: boolean) {
    setPicked((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  async function run(selection: "smoke" | "all" | "custom", ids: string[] = []) {
    if (working) return;
    setWorking(true);
    setError("");
    try {
      const res = await fetch("/api/admin/qa/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product, selection, testIds: ids, targetEnv, targetUrl: previewUrl }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Couldn't start the run.");
        if (data.runId) router.refresh();
        return;
      }
      router.push(`/admin/qa/runs/${data.runId}`);
    } catch {
      setError("Network error — try again.");
    } finally {
      setWorking(false);
    }
  }

  const btn = "rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50";

  return (
    <section className="mb-8 rounded-xl border-2 border-[#B8860B] bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-end gap-4">
        <label className="text-sm text-zinc-700">
          Run against
          <select
            value={targetEnv}
            onChange={(e) => setTargetEnv(e.target.value as "production" | "preview")}
            className="mt-1 block rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          >
            <option value="production">Production ({productionUrl.replace("https://", "")})</option>
            <option value="preview">A preview deployment…</option>
          </select>
        </label>
        {targetEnv === "preview" && (
          <label className="min-w-[18rem] flex-1 text-sm text-zinc-700">
            Preview URL
            <input
              value={previewUrl}
              onChange={(e) => setPreviewUrl(e.target.value)}
              placeholder="https://vision-workx-git-branch-….vercel.app"
              className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
            />
          </label>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" disabled={working || !dispatchReady} onClick={() => run("smoke")} className={`${btn} bg-navy-dark text-white hover:bg-navy`}>
          Run smoke{smokeCount ? ` (${smokeCount})` : ""}
        </button>
        <button type="button" disabled={working || !dispatchReady} onClick={() => run("all")} className={`${btn} border border-zinc-300 text-zinc-800 hover:bg-zinc-50`}>
          Run all{tests.length ? ` (${tests.length})` : ""}
        </button>
        <button
          type="button"
          disabled={working || !dispatchReady || picked.size === 0}
          onClick={() => run("custom", [...picked])}
          className={`${btn} border border-zinc-300 text-zinc-800 hover:bg-zinc-50`}
        >
          Run selected ({picked.size})
        </button>
        {failing.length > 0 && (
          <button
            type="button"
            disabled={working || !dispatchReady}
            onClick={() => run("custom", failing)}
            className={`${btn} border border-red-300 text-red-700 hover:bg-red-50`}
          >
            Re-run failing ({failing.length})
          </button>
        )}
      </div>
      {!dispatchReady && <p className="mt-3 text-sm text-amber-800">Runs are off until QA_GITHUB_TOKEN is set in Vercel.</p>}
      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {tests.length === 0 ? (
        <p className="mt-6 text-sm text-zinc-500">
          No tests synced yet. Click <strong>Run all</strong> once — the runner reports every test it finds, and they&apos;ll be listed
          here.
        </p>
      ) : (
        <div className="mt-6 space-y-5">
          <div className="flex gap-3 text-xs font-semibold">
            <button type="button" onClick={() => setOpenAreas(new Set(areas.map(([a]) => a)))} className="text-navy hover:underline">
              Expand all
            </button>
            <button type="button" onClick={() => setOpenAreas(new Set())} className="text-navy hover:underline">
              Collapse all
            </button>
          </div>
          {areas.map(([area, list]) => {
            const allOn = list.every((t) => picked.has(t.id));
            const open = openAreas.has(area);
            const failed = list.filter((t) => t.last === "failed" || t.last === "timed_out").length;
            const passed = list.filter((t) => t.last === "passed" || t.last === "flaky").length;
            const panelId = `area-${area.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
            return (
              <fieldset key={area} className="rounded-lg border border-zinc-200">
                <legend className="sr-only">{area}</legend>
                <div className="flex items-center gap-2 px-3 py-2 text-sm">
                  <button
                    type="button"
                    onClick={() => setOpenAreas((prev) => { const next = new Set(prev); if (next.has(area)) next.delete(area); else next.add(area); return next; })}
                    aria-expanded={open}
                    aria-controls={panelId}
                    className="flex h-6 w-6 items-center justify-center rounded text-zinc-500 hover:bg-zinc-100"
                    title={open ? "Collapse" : "Expand"}
                  >
                    <span aria-hidden="true" className={`inline-block transition-transform ${open ? "rotate-90" : ""}`}>▶</span>
                    <span className="sr-only">{open ? `Collapse ${area}` : `Expand ${area}`}</span>
                  </button>
                  <input type="checkbox" checked={allOn} onChange={(e) => toggle(list.map((t) => t.id), e.target.checked)} aria-label={`Select all ${area}`} />
                  <button
                    type="button"
                    onClick={() => setOpenAreas((prev) => { const next = new Set(prev); if (next.has(area)) next.delete(area); else next.add(area); return next; })}
                    className="font-bold text-zinc-900 hover:underline"
                  >
                    {area}
                  </button>
                  <span className="text-xs text-zinc-500">
                    {list.length} test{list.length === 1 ? "" : "s"}
                    {passed > 0 && <span className="text-emerald-700"> · {passed} passed</span>}
                    {failed > 0 && <span className="font-semibold text-red-700"> · {failed} failed</span>}
                  </span>
                </div>
                <ul id={panelId} hidden={!open} className="space-y-1 border-t border-zinc-100 px-3 py-2 pl-12">
                  {list.map((t) => (
                    <li key={t.id} className="flex items-center gap-2 text-sm">
                      <input id={t.id} type="checkbox" checked={picked.has(t.id)} onChange={(e) => toggle([t.id], e.target.checked)} />
                      <span className={`h-2 w-2 shrink-0 rounded-full ${t.last ? DOT[t.last] : "bg-zinc-200"}`} title={t.last ?? "not run yet"} />
                      <label htmlFor={t.id} className="text-zinc-800">
                        {t.title}
                      </label>
                      {t.tags.includes("smoke") && <span className="rounded bg-zinc-100 px-1.5 text-xs text-zinc-500">smoke</span>}
                      {t.requires.map((r) => (
                        <span key={r} className="rounded bg-amber-50 px-1.5 text-xs text-amber-800" title="Needs extra setup">
                          {r}
                        </span>
                      ))}
                    </li>
                  ))}
                </ul>
              </fieldset>
            );
          })}
        </div>
      )}
    </section>
  );
}
