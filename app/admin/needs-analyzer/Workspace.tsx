"use client";

/* eslint-disable @next/next/no-img-element -- logos are operator-set external addresses */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { logoUrl, moduleLogoSlot } from "@/lib/needsAnalyzer/brand";
import { SECTIONS, type Field } from "@/lib/needsAnalyzer/questions";
import { computePlan, situation, type Plan, type PlanItem, type ScoredModule } from "@/lib/needsAnalyzer/rules";
import { STATUSES, type Assessment, type Catalog, type Ecosystem, type Overrides, type WebsiteBuild } from "@/lib/needsAnalyzer/types";
import { fmtDate } from "@/lib/needsAnalyzer/format";
import { proposalFindings, type SiteCheck } from "@/lib/needsAnalyzer/siteChecks";
import { Proposal } from "./Proposal";
import WebsiteBuilder from "./WebsiteBuilder";
import {
  api,
  Badge,
  BTN,
  BTN_DANGER,
  BTN_PRIMARY,
  CARD,
  CAT_STYLE,
  INPUT,
  moneyFmt,
  NaShell,
  NUM,
  Stat,
  uid,
  useClientMode,
  useDebouncedSave,
  useToast,
  type NavItem,
} from "./ui";

type Tab = "q" | "plan" | "proposal" | "builder" | "internal";
const TABS: Tab[] = ["q", "plan", "proposal", "builder", "internal"];

interface Props {
  initial: Assessment;
  catalog: Catalog;
  ecosystem: Ecosystem;
  initialTab?: string;
  initialSection?: string;
  latestCheck: SiteCheck | null;
  proposalCheck: SiteCheck | null;
}

export default function Workspace(props: Props) {
  const [tab, setTab] = useState<Tab>(TABS.includes(props.initialTab as Tab) ? (props.initialTab as Tab) : "q");
  const [section, setSection] = useState(props.initialSection ?? SECTIONS[0].id);

  const go = useCallback((t: Tab, s?: string) => {
    setTab(t);
    if (s) setSection(s);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", t);
    if (s) url.searchParams.set("section", s);
    else if (t !== "q") url.searchParams.delete("section");
    window.history.replaceState(null, "", url);
    window.scrollTo(0, 0);
  }, []);

  const items: NavItem[] = [
    { key: "q", label: "Questionnaire", onClick: () => go("q") },
    { key: "plan", label: "Build plan", onClick: () => go("plan") },
    { key: "proposal", label: "Proposal", onClick: () => go("proposal") },
    { key: "builder", label: "Website builder", onClick: () => go("builder"), internal: true },
    { key: "internal", label: "Internal notes", onClick: () => go("internal"), internal: true },
  ];

  return (
    <NaShell active={tab} items={items}>
      <Body {...props} tab={tab} section={section} go={go} />
    </NaShell>
  );
}

function Body({
  initial,
  catalog,
  ecosystem,
  tab,
  section,
  go,
  latestCheck,
  proposalCheck,
}: Props & { tab: Tab; section: string; go: (t: Tab, s?: string) => void }) {
  const toast = useToast();
  const { on: clientMode } = useClientMode();
  const [a, setA] = useState(initial);
  const [saveState, setSaveState] = useState("");

  const { schedule, flush } = useDebouncedSave<Assessment>(async (v) => {
    try {
      const r = await fetch(`/api/admin/needs-analyzer/assessments/${v.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: v.status, answers: v.answers, overrides: v.overrides }),
        keepalive: true,
      });
      if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error || r.statusText);
      setSaveState("Saved " + new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
    } catch (e) {
      setSaveState("Not saved");
      toast("Save failed: " + (e as Error).message);
    }
  });

  // aRef is the latest assessment, so edits compose without waiting for a render.
  const aRef = useRef(initial);
  const update = useCallback(
    (fn: (prev: Assessment) => Assessment) => {
      const next = fn(aRef.current);
      aRef.current = next;
      setA(next);
      schedule(next);
      setSaveState("Saving…");
    },
    [schedule],
  );
  // Local-only change (e.g. the share link, saved by its own endpoint): no autosave.
  const patchLocal = useCallback((patch: Partial<Assessment>) => {
    aRef.current = { ...aRef.current, ...patch };
    setA(aRef.current);
  }, []);

  // Website builder writes into overrides.websiteBuild, so it autosaves like the plan.
  const setWb = useCallback(
    (patch: Partial<WebsiteBuild>) =>
      update((p) => ({ ...p, overrides: { ...(p.overrides || {}), websiteBuild: { ...(p.overrides?.websiteBuild || {}), ...patch } } })),
    [update],
  );

  // Save straight away when switching tabs, like the offline app does on navigation.
  useEffect(() => flush(), [tab, flush]);

  // Internal notes and the website builder aren't reachable in client mode.
  const view = clientMode && (tab === "internal" || tab === "builder") ? "plan" : tab;
  const plan = useMemo(() => computePlan(a, catalog, ecosystem), [a, catalog, ecosystem]);
  const title = String(a.answers.bizName || "") || "New assessment";

  return (
    <>
      {view === "q" && (
        <Questionnaire a={a} update={update} section={section} go={go} title={title} saveState={saveState} latestCheck={latestCheck} flush={flush} />
      )}
      {view === "plan" && <PlanView a={a} plan={plan} catalog={catalog} update={update} go={go} saveState={saveState} />}
      {view === "proposal" && <ProposalTab a={a} patchLocal={patchLocal} plan={plan} catalog={catalog} go={go} proposalCheck={proposalCheck} />}
      {view === "builder" && <WebsiteBuilder wb={a.overrides?.websiteBuild || {}} setWb={setWb} catalog={catalog} go={go} saveState={saveState} />}
      {view === "internal" && <InternalView a={a} plan={plan} catalog={catalog} go={go} latestCheck={latestCheck} />}
    </>
  );
}

const answered = (v: unknown) => v !== undefined && v !== "" && !(Array.isArray(v) && !v.length);

// ---------- questionnaire ----------

function Questionnaire({
  a,
  update,
  section,
  go,
  title,
  saveState,
  latestCheck,
  flush,
}: {
  a: Assessment;
  update: (fn: (p: Assessment) => Assessment) => void;
  section: string;
  go: (t: Tab, s?: string) => void;
  title: string;
  saveState: string;
  latestCheck: SiteCheck | null;
  flush: () => void;
}) {
  const { on: clientMode } = useClientMode();
  const secs = SECTIONS.filter((s) => !(s.internal && clientMode));
  const sec = secs.find((s) => s.id === section) || secs[0];
  const idx = secs.indexOf(sec);
  const A = a.answers;
  const setAnswer = (id: string, v: Assessment["answers"][string]) => update((p) => ({ ...p, answers: { ...p.answers, [id]: v } }));

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">{title}</h1>
          <span className="text-xs text-zinc-500">{saveState}</span>
        </div>
        <button type="button" className={BTN_PRIMARY} onClick={() => go("plan")}>
          See build plan →
        </button>
      </div>
      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <nav className={`${CARD} h-fit p-2`}>
          {secs.map((s) => {
            const done = s.fields.filter((f) => answered(A[f.id])).length;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => go("q", s.id)}
                className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm ${s === sec ? "bg-teal-50 font-semibold text-teal-700" : "text-zinc-700 hover:bg-zinc-50"}`}
              >
                <span>{s.title}</span>
                <span className="text-xs text-zinc-400">
                  {done}/{s.fields.length}
                </span>
              </button>
            );
          })}
        </nav>
        <section className={CARD}>
          <h2 className="text-xl font-bold text-zinc-900">{sec.title}</h2>
          {sec.intro && <p className="mt-1 text-sm text-zinc-500">{sec.intro}</p>}
          {sec.id === "business" && !clientMode && <WebsiteCheckBanner a={a} latestCheck={latestCheck} flush={flush} />}
          <div className="mt-4 space-y-5">
            {sec.fields.map((f) => (
              <FieldInput key={f.id} f={f} value={A[f.id]} onChange={(v) => setAnswer(f.id, v)} />
            ))}
          </div>
          <div className="mt-8 flex justify-between">
            {idx > 0 ? (
              <button type="button" className={BTN} onClick={() => go("q", secs[idx - 1].id)}>
                ← {secs[idx - 1].title}
              </button>
            ) : (
              <span />
            )}
            {idx < secs.length - 1 ? (
              <button type="button" className={BTN_PRIMARY} onClick={() => go("q", secs[idx + 1].id)}>
                {secs[idx + 1].title} →
              </button>
            ) : (
              <button type="button" className={BTN_PRIMARY} onClick={() => go("plan")}>
                See build plan →
              </button>
            )}
          </div>
        </section>
      </div>
    </>
  );
}

function Pill({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-sm ${on ? "border-teal-700 bg-teal-700 text-white" : "border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400"}`}
    >
      {children}
    </button>
  );
}

function FieldInput({ f, value: v, onChange }: { f: Field; value: Assessment["answers"][string]; onChange: (v: Assessment["answers"][string]) => void }) {
  const toggle = (x: string | number) => onChange(v === x ? "" : (x as string));
  let input: ReactNode = null;
  switch (f.type) {
    case "text":
      input = <input type="text" className={INPUT} value={String(v ?? "")} placeholder={f.placeholder} onChange={(e) => onChange(e.target.value)} />;
      break;
    case "number":
      input = (
        <input
          type="number"
          min={0}
          className={`${INPUT} max-w-[200px]`}
          value={v === undefined || v === "" ? "" : String(v)}
          onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
        />
      );
      break;
    case "textarea":
      input = <textarea className={`${INPUT} min-h-[90px]`} value={String(v ?? "")} onChange={(e) => onChange(e.target.value)} />;
      break;
    case "select":
      input = (
        <div className="flex flex-wrap gap-2">
          {f.options!.map((o) => (
            <Pill key={o} on={v === o} onClick={() => toggle(o)}>
              {o}
            </Pill>
          ))}
        </div>
      );
      break;
    case "multi": {
      const cur = new Set((v as string[] | undefined) || []);
      input = (
        <div className="flex flex-wrap gap-2">
          {f.options!.map((o) => (
            <Pill
              key={o}
              on={cur.has(o)}
              onClick={() => {
                const next = new Set(cur);
                if (next.has(o)) next.delete(o);
                else next.add(o);
                onChange([...next]);
              }}
            >
              {o}
            </Pill>
          ))}
        </div>
      );
      break;
    }
    case "yesno":
      input = (
        <div className="flex gap-2">
          {["Yes", "No"].map((o) => (
            <Pill key={o} on={v === o} onClick={() => toggle(o)}>
              {o}
            </Pill>
          ))}
        </div>
      );
      break;
    case "scale":
      input = (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-zinc-500">{f.low}</span>
          {[1, 2, 3, 4, 5].map((n) => (
            <Pill key={n} on={Number(v) === n} onClick={() => onChange(Number(v) === n ? "" : n)}>
              {n}
            </Pill>
          ))}
          <span className="text-xs text-zinc-500">{f.high}</span>
        </div>
      );
      break;
  }
  return (
    <div>
      <div className="mb-1.5 text-sm font-semibold text-zinc-800">{f.label}</div>
      {input}
      {f.help && <div className="mt-1 text-xs text-zinc-500">{f.help}</div>}
    </div>
  );
}

// ---------- build plan ----------

function ModuleLogo({ catalog, it }: { catalog: Catalog; it: { id: string; category: string } }) {
  const slot = moduleLogoSlot(catalog, it);
  const url = slot ? logoUrl(catalog, slot) : null;
  return url ? <img referrerPolicy="no-referrer" src={url} alt="" className="h-5 w-5 rounded object-contain" /> : null;
}

function PlanView({
  a,
  plan: P,
  catalog,
  update,
  go,
  saveState,
}: {
  a: Assessment;
  plan: Plan;
  catalog: Catalog;
  update: (fn: (p: Assessment) => Assessment) => void;
  go: (t: Tab) => void;
  saveState: string;
}) {
  const toast = useToast();
  const { on: clientMode } = useClientMode();
  const m = moneyFmt(catalog);
  const inc = new Set(P.items.map((i) => i.id));
  const notIncluded = P.all.filter((x) => !inc.has(x.id)).sort((x, y) => y.score - x.score);
  const sit = situation(a.answers);
  const [ci, setCi] = useState({ name: "", description: "", phase: 3, setup: 0, monthly: 0, effortHours: 0 });

  const setOv = (fn: (o: Overrides) => Overrides) => update((p) => ({ ...p, overrides: fn(p.overrides || {}) }));

  function toggle(id: string, checked: boolean) {
    const mod = P.all.find((x) => x.id === id);
    setOv((o) => {
      const ex = new Set(o.excluded || []);
      const ad = new Set(o.added || []);
      if (checked) {
        ex.delete(id);
        if (!mod?.recommended) ad.add(id);
      } else {
        ad.delete(id);
        ex.add(id);
      }
      return { ...o, excluded: [...ex], added: [...ad] };
    });
  }

  function setPrice(it: PlanItem, k: "setup" | "monthly" | "qty", value: number) {
    setOv((o) => {
      if (it.custom) return { ...o, custom: (o.custom || []).map((c) => (c.id === it.id ? { ...c, [k]: value } : c)) };
      return { ...o, prices: { ...(o.prices || {}), [it.id]: { ...(o.prices?.[it.id] || {}), [k]: value } } };
    });
  }

  function addCustom() {
    if (!ci.name.trim()) {
      toast("Give the item a name");
      return;
    }
    setOv((o) => ({
      ...o,
      custom: [...(o.custom || []), { id: "custom-" + uid(), ...ci, name: ci.name.trim(), description: ci.description.trim(), requires: ["data-store", "hosting"] }],
    }));
    setCi({ name: "", description: "", phase: 3, setup: 0, monthly: 0, effortHours: 0 });
    toast("Added");
  }

  const row = (it: PlanItem | ScoredModule, on: boolean) => {
    const pi = it as PlanItem;
    return (
      <div key={it.id} className={`grid grid-cols-[auto_1fr] gap-3 border-t border-zinc-100 py-3 sm:grid-cols-[auto_1fr_auto] ${on ? "" : "opacity-70"}`}>
        <input
          type="checkbox"
          className="mt-1 h-4 w-4"
          checked={on}
          disabled={pi.custom}
          title="Include in plan"
          aria-label={`Include ${it.name}`}
          onChange={(e) => toggle(it.id, e.target.checked)}
        />
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <ModuleLogo catalog={catalog} it={it} />
            <strong className="text-zinc-900">{it.name}</strong>
            <Badge className={CAT_STYLE[it.category] || ""}>{it.category}</Badge>
            {it.autoReason && <Badge>{it.autoReason}</Badge>}
            {!on && !clientMode && it.score ? <Badge>fit {it.score}</Badge> : null}
          </div>
          <div className="text-sm text-zinc-500">{it.description}</div>
          {it.reasons?.length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-sm text-zinc-600">
              {it.reasons.slice(0, 3).map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}
          {pi.custom && (
            <button type="button" className={`${BTN_DANGER} mt-2`} onClick={() => setOv((o) => ({ ...o, custom: (o.custom || []).filter((c) => c.id !== it.id) }))}>
              Remove
            </button>
          )}
        </div>
        <div className="col-span-2 sm:col-span-1">
          {on ? (
            <div className="grid grid-cols-[auto_auto] items-center gap-x-2 gap-y-1 text-sm">
              <span className="text-zinc-500">Setup</span>
              <input className={NUM} type="number" min={0} value={pi.setup} onChange={(e) => setPrice(pi, "setup", Number(e.target.value))} />
              <span className="text-zinc-500">Monthly</span>
              <input className={NUM} type="number" min={0} value={pi.monthly} onChange={(e) => setPrice(pi, "monthly", Number(e.target.value))} />
              {(pi.qty > 1 || it.id === "proactive") && (
                <>
                  <span className="text-zinc-500">Qty</span>
                  <input className={NUM} type="number" min={1} value={pi.qty} onChange={(e) => setPrice(pi, "qty", Number(e.target.value))} />
                </>
              )}
            </div>
          ) : (
            <span className="text-sm text-zinc-500">
              {m(it.setup)} + {m(it.monthly)}/mo
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Build plan — {String(a.answers.bizName || "Untitled")}</h1>
          <p className="text-sm text-zinc-500">
            Tick or untick items and adjust prices. The proposal updates automatically. <span className="text-xs">{saveState}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            className={`${INPUT} w-auto`}
            value={a.status}
            aria-label="Status"
            onChange={(e) => update((p) => ({ ...p, status: e.target.value }))}
          >
            {STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <button type="button" className={BTN_PRIMARY} onClick={() => go("proposal")}>
            Open proposal →
          </button>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="One-time setup" value={m(P.setupNet)} sub={P.discount ? `after ${P.discountPct}% discount` : undefined} />
        <Stat label="Monthly" value={m(P.monthly)} />
        <Stat label="Time saved" value={`${P.hoursSaved} h/wk`} sub={`≈ ${m(P.timeValue)}/mo of time`} />
        <Stat
          label="Recovered revenue"
          value={P.extraRevenue ? `${m(P.extraRevenue)}/mo` : "—"}
          sub={P.recoveredLeads ? `≈ ${P.recoveredLeads} leads/mo saved` : "needs lead volume & customer value"}
        />
        <Stat label="Payback" value={P.paybackMonths ? `${P.paybackMonths} mo` : "—"} sub="estimate" />
      </div>

      {sit.length > 0 && (
        <div className={CARD}>
          <h3 className="mb-2 font-semibold text-zinc-900">What we heard</h3>
          <ul className="list-disc pl-5 text-sm text-zinc-700">
            {sit.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
      )}

      {P.phases.length ? (
        P.phases.map((ph) => (
          <div key={ph.key} className={`${CARD} border-l-4 border-l-teal-700`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-lg font-bold text-zinc-900">{ph.name}</h2>
                <span className="text-sm text-zinc-500">{ph.timing}</span>
              </div>
              <div className="text-sm">
                <strong>{m(ph.setup)}</strong> setup · <strong>{m(ph.monthly)}</strong>/mo
              </div>
            </div>
            {ph.items.map((it) => row(it, true))}
          </div>
        ))
      ) : (
        <div className={`${CARD} text-center text-zinc-500`}>No modules match yet. Fill in more of the questionnaire, or add items below.</div>
      )}

      <div className={CARD}>
        <details>
          <summary className="cursor-pointer font-semibold text-zinc-900">Other modules ({notIncluded.length}) — add any the client wants</summary>
          {notIncluded.map((x) => row(x, false))}
        </details>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className={CARD}>
          <h3 className="mb-3 font-semibold text-zinc-900">Add a custom line item</h3>
          <input className={`${INPUT} mb-2`} placeholder="Name, e.g. Church member directory" value={ci.name} onChange={(e) => setCi({ ...ci, name: e.target.value })} />
          <textarea
            className={`${INPUT} mb-2 min-h-[70px]`}
            placeholder="What it does, in the client's language"
            value={ci.description}
            onChange={(e) => setCi({ ...ci, description: e.target.value })}
          />
          <div className="flex flex-wrap gap-3 text-sm">
            <label className="flex items-center gap-1">
              Phase
              <select className={`${NUM} w-16`} value={ci.phase} onChange={(e) => setCi({ ...ci, phase: Number(e.target.value) })}>
                {[1, 2, 3].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1">
              Setup <input className={NUM} type="number" value={ci.setup} onChange={(e) => setCi({ ...ci, setup: Number(e.target.value) || 0 })} />
            </label>
            <label className="flex items-center gap-1">
              Monthly <input className={NUM} type="number" value={ci.monthly} onChange={(e) => setCi({ ...ci, monthly: Number(e.target.value) || 0 })} />
            </label>
            {!clientMode && (
              <label className="flex items-center gap-1">
                Effort h <input className={NUM} type="number" value={ci.effortHours} onChange={(e) => setCi({ ...ci, effortHours: Number(e.target.value) || 0 })} />
              </label>
            )}
          </div>
          <button type="button" className={`${BTN_PRIMARY} mt-3`} onClick={addCustom}>
            Add to plan
          </button>
        </div>
        <div className={CARD}>
          <h3 className="mb-3 font-semibold text-zinc-900">Discount</h3>
          <label className="flex items-center gap-2 text-sm">
            Setup discount %
            <input
              className={NUM}
              type="number"
              min={0}
              max={100}
              value={P.discountPct}
              onChange={(e) => setOv((o) => ({ ...o, discountPct: Number(e.target.value) || 0 }))}
            />
          </label>
          <p className="mt-2 text-sm text-zinc-500">Useful for a founding-client rate in exchange for a case study.</p>
          <button
            type="button"
            className={`${BTN} mt-3`}
            onClick={() => {
              if (confirm("Clear all manual changes (ticks, prices, discount)? Custom line items are kept.")) setOv((o) => ({ custom: o.custom || [] }));
            }}
          >
            Reset to recommended plan
          </button>
        </div>
      </div>
    </>
  );
}

// ---------- proposal + client link ----------

function ProposalTab({
  a,
  patchLocal,
  plan,
  catalog,
  go,
  proposalCheck,
}: {
  a: Assessment;
  patchLocal: (patch: Partial<Assessment>) => void;
  plan: Plan;
  catalog: Catalog;
  go: (t: Tab) => void;
  proposalCheck: SiteCheck | null;
}) {
  const toast = useToast();
  const { on: clientMode } = useClientMode();
  const [busy, setBusy] = useState(false);
  const [origin, setOrigin] = useState("");
  // eslint-disable-next-line react-hooks/set-state-in-effect -- window only exists after mount
  useEffect(() => setOrigin(window.location.origin), []);
  const link = a.shareToken ? `${origin}/proposal/${a.shareToken}` : "";

  async function share(action: "enable" | "disable" | "regenerate") {
    if (action === "regenerate" && !confirm("Make a new link? The current link stops working.")) return;
    setBusy(true);
    try {
      const r = await api<{ shareToken: string | null; shareEnabled: boolean }>("POST", `/api/admin/needs-analyzer/assessments/${a.id}/share`, { action });
      patchLocal({ shareToken: r.shareToken, shareEnabled: r.shareEnabled });
      toast(action === "disable" ? "Link turned off" : action === "regenerate" ? "New link made" : "Link is on");
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="mx-auto mb-4 flex max-w-[850px] flex-wrap items-center justify-between gap-3 print:hidden">
        <span className="text-sm text-zinc-500">Print → Save as PDF, or share a link the client can open any time.</span>
        <div className="flex gap-2">
          <button type="button" className={BTN} onClick={() => go("plan")}>
            Edit plan
          </button>
          <button type="button" className={BTN_PRIMARY} onClick={() => window.print()}>
            Print / Save PDF
          </button>
        </div>
      </div>
      {!clientMode && (
        <div className={`${CARD} mx-auto max-w-[850px] print:hidden`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold text-zinc-900">
                Client link <Badge tone={a.shareEnabled ? "ok" : "plain"}>{a.shareEnabled ? "on" : "off"}</Badge>
              </h3>
              <p className="text-sm text-zinc-500">Shows this proposal only (never internal notes, scores or margin). Hidden from search engines.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {a.shareEnabled ? (
                <>
                  <button
                    type="button"
                    className={BTN}
                    onClick={() => navigator.clipboard.writeText(link).then(() => toast("Link copied"), () => toast("Couldn't copy"))}
                  >
                    Copy link
                  </button>
                  <button type="button" className={BTN} disabled={busy} onClick={() => share("regenerate")}>
                    New link
                  </button>
                  <button type="button" className={BTN_DANGER} disabled={busy} onClick={() => share("disable")}>
                    Turn off
                  </button>
                </>
              ) : (
                <button type="button" className={BTN_PRIMARY} disabled={busy} onClick={() => share("enable")}>
                  Turn on link
                </button>
              )}
            </div>
          </div>
          {a.shareEnabled && link && (
            <a href={link} target="_blank" rel="noopener noreferrer" className="mt-2 block break-all text-sm text-teal-700 hover:underline">
              {link}
            </a>
          )}
        </div>
      )}
      <Proposal answers={a.answers} plan={plan} catalog={catalog} prepared={a.updatedAt} siteFindings={proposalFindings(proposalCheck)} websiteBuild={a.overrides?.websiteBuild} />
    </>
  );
}

// ---------- internal notes ----------

function InternalView({
  a,
  plan: P,
  catalog,
  go,
  latestCheck,
}: {
  a: Assessment;
  plan: Plan;
  catalog: Catalog;
  go: (t: Tab, s?: string) => void;
  latestCheck: SiteCheck | null;
}) {
  const m = moneyFmt(catalog);
  const A = a.answers;
  const flags = P.items.flatMap((i) => (i.flags || []).map((f) => ({ name: i.name, f })));
  const fit = (ok: boolean | null) => (ok === null ? <Badge>unknown</Badge> : ok ? <Badge tone="ok">fits</Badge> : <Badge tone="bad">over</Badge>);
  const stTone = (s: string) => (s === "ready" ? "ok" : s === "gap" ? "bad" : "warn") as "ok" | "bad" | "warn";
  const stLabel = (s: string) => (s === "ready" ? "Ready" : s === "gap" ? "Gap" : "Unconfirmed");
  const say = (k: string) => String(A[k] || "") || "—";

  return (
    <>
      <h1 className="text-2xl font-bold text-zinc-900">Internal notes — {String(A.bizName || "Untitled")}</h1>
      <p className="mb-4 text-sm text-zinc-500">Private to you. Turn on Client mode before turning the screen around.</p>
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Setup (net)" value={m(P.setupNet)} />
        <Stat label="Effort" value={`${P.effortHours} h`} sub={`at ${m(catalog.settings.internalRate)}/h`} />
        <Stat label="Internal cost" value={m(P.internalCost)} />
        <Stat label="Setup margin" value={m(P.margin)} valueClass={P.margin >= 0 ? "!text-emerald-700" : "!text-red-700"} />
        <Stat label="Recurring" value={`${m(P.monthly)}/mo`} sub={`${m(P.monthly * 12)}/yr`} />
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <div className={CARD}>
          <h3 className="mb-2 font-semibold text-zinc-900">Budget fit</h3>
          <table className="w-full text-sm">
            <tbody>
              <tr className="border-b border-zinc-100">
                <td className="py-2">Full plan vs one-time budget ({String(A.budget || "not given")})</td>
                <td className="py-2 text-right">{fit(P.budget.setupOk)}</td>
              </tr>
              <tr className="border-b border-zinc-100">
                <td className="py-2">Phase 1 vs one-time budget</td>
                <td className="py-2 text-right">{fit(P.budget.phase1Ok)}</td>
              </tr>
              <tr>
                <td className="py-2">Monthly vs monthly budget ({String(A.monthlyBudget || "not given")})</td>
                <td className="py-2 text-right">{fit(P.budget.monthlyOk)}</td>
              </tr>
            </tbody>
          </table>
          {P.budget.setupOk === false && P.budget.phase1Ok && <p className="mt-2 text-sm text-zinc-500">Lead with Phase 1 only and present later phases as a roadmap.</p>}
        </div>
        <div className={CARD}>
          <h3 className="mb-2 font-semibold text-zinc-900">Ask next</h3>
          {P.openQuestions.length ? (
            <ul className="list-disc pl-5 text-sm">
              {P.openQuestions.map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-zinc-500">All the essentials are answered.</p>
          )}
          {A.decisionMaker ? (
            <p className="mt-2 text-sm">
              Decision-maker in the room: <strong>{String(A.decisionMaker)}</strong>
            </p>
          ) : null}
        </div>
      </div>

      <div className={CARD}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-zinc-900">Can we deliver it? (ecosystem check)</h3>
          <Link href="/admin/needs-analyzer/ecosystem" className="text-sm text-teal-700 hover:underline">
            Edit ecosystem →
          </Link>
        </div>
        <p className="mb-2 text-sm text-zinc-500">Each planned item is checked against the tools and databases in the Revalor / VisionWorkx ecosystem.</p>
        {!P.readiness.some((r) => r.status !== "ready") && (
          <p className="mb-2">
            <Badge tone="ok">Everything in this plan is supported by tools marked In use.</Badge>
          </p>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
                <th className="py-2 pr-3">Item</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2">Needs</th>
              </tr>
            </thead>
            <tbody>
              {P.readiness.map((r) => (
                <tr key={r.id} className="border-b border-zinc-100">
                  <td className="py-2 pr-3">{r.name}</td>
                  <td className="py-2 pr-3">
                    <Badge tone={stTone(r.status)}>{stLabel(r.status)}</Badge>
                  </td>
                  <td className="py-2">
                    <div className="flex flex-wrap gap-1">
                      {r.caps.length ? (
                        r.caps.map((c) => (
                          <Badge key={c.id} tone={stTone(c.status)} title={c.tools.map((t) => t.name).join(", ") || "No tool provides this"}>
                            {c.name}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <WebsiteCheckCard a={a} check={latestCheck} catalog={catalog} />

      {flags.length > 0 && (
        <div className={CARD}>
          <h3 className="mb-2 font-semibold text-zinc-900">Flags</h3>
          {flags.map((x, i) => (
            <div key={i} className="mb-1 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <strong>{x.name}:</strong> {x.f}
            </div>
          ))}
        </div>
      )}

      <div className={CARD}>
        <h3 className="font-semibold text-zinc-900">All modules by fit score</h3>
        <p className="mb-2 text-sm text-zinc-500">Items at or above {P.threshold} are recommended automatically (change the threshold under Catalog & pricing).</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
                <th className="py-2 pr-3">Module</th>
                <th className="py-2 pr-3">Fit</th>
                <th className="py-2 pr-3">In plan</th>
                <th className="py-2">Why</th>
              </tr>
            </thead>
            <tbody>
              {[...P.all]
                .sort((x, y) => y.score - x.score)
                .map((x) => (
                  <tr key={x.id} className="border-b border-zinc-100 align-top">
                    <td className="py-2 pr-3">
                      <strong>{x.name}</strong>
                      <br />
                      <Badge className={CAT_STYLE[x.category] || ""}>{x.category}</Badge>
                    </td>
                    <td className="whitespace-nowrap py-2 pr-3">
                      {x.score}
                      <span className="ml-2 inline-block h-1.5 w-16 overflow-hidden rounded bg-zinc-100 align-middle">
                        <span className="block h-full bg-teal-700" style={{ width: `${x.score}%` }} />
                      </span>
                    </td>
                    <td className="py-2 pr-3">{P.items.some((i) => i.id === x.id) ? <Badge tone="ok">Yes</Badge> : <Badge>No</Badge>}</td>
                    <td className="py-2 text-zinc-600">{[...x.reasons, ...x.flags].join(" · ") || <span className="text-zinc-400">No signals</span>}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className={CARD}>
          <h3 className="mb-2 font-semibold text-zinc-900">Their words</h3>
          <p className="text-sm">
            <strong>Top headaches:</strong> {say("topPains")}
          </p>
          <p className="text-sm">
            <strong>Tool frustrations:</strong> {say("toolsFrustration")}
          </p>
          <p className="text-sm">
            <strong>Unusual process:</strong> {say("uniqueProcess")}
          </p>
        </div>
        <div className={CARD}>
          <h3 className="mb-2 font-semibold text-zinc-900">Your notes</h3>
          <p className="text-sm">
            <strong>Website:</strong> {say("siteObservations")}
          </p>
          <p className="text-sm">
            <strong>Red flags:</strong> {say("redFlags")}
          </p>
          <p className="text-sm">
            <strong>Other:</strong> {say("consultantNotes")}
          </p>
          <button type="button" className={`${BTN} mt-2`} onClick={() => go("q", "notes")}>
            Edit notes
          </button>
        </div>
      </div>
    </>
  );
}

// ---------- website check ----------

function websiteCheckHref(a: Assessment, run: boolean) {
  const q = new URLSearchParams({ assessment: a.id });
  const site = String(a.answers.website || "").trim();
  if (site) q.set("url", site);
  if (run && site) q.set("run", "1");
  return `/admin/needs-analyzer/website?${q}`;
}

function WebsiteCheckBanner({ a, latestCheck, flush }: { a: Assessment; latestCheck: SiteCheck | null; flush: () => void }) {
  const site = String(a.answers.website || "").trim();
  const n = latestCheck?.report.issues.length ?? 0;
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-900">
      <span>
        {latestCheck
          ? `Website checked ${fmtDate(latestCheck.createdAt)}: ${n} problem${n === 1 ? "" : "s"} found.`
          : site
            ? "Check their website to fill in the platform, forms and booking answers automatically."
            : "Enter their website below, then check it to fill in answers automatically."}
      </span>
      <span className="flex gap-2">
        {latestCheck && (
          <Link className={BTN} href={`/admin/needs-analyzer/website?check=${latestCheck.id}&assessment=${a.id}`}>
            View check
          </Link>
        )}
        {/* Save first, so a website that was just typed is stored before leaving. */}
        <Link className={BTN_PRIMARY} href={websiteCheckHref(a, true)} onClick={flush}>
          {latestCheck ? "Check again" : "Check website"}
        </Link>
      </span>
    </div>
  );
}

function WebsiteCheckCard({ a, check, catalog }: { a: Assessment; check: SiteCheck | null; catalog: Catalog }) {
  const names = Object.fromEntries(catalog.modules.map((m) => [m.id, m.name]));
  return (
    <div className={CARD}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-zinc-900">Website check</h3>
        <Link
          href={check ? `/admin/needs-analyzer/website?check=${check.id}&assessment=${a.id}` : websiteCheckHref(a, true)}
          className="text-sm text-teal-700 hover:underline"
        >
          {check ? "Open full report →" : "Check their website →"}
        </Link>
      </div>
      {check ? (
        <div className="mt-2 grid gap-4 text-sm md:grid-cols-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-zinc-500">Site</div>
            <div className="font-medium">{check.report.finalUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}</div>
            <div className="text-zinc-500">
              {check.report.platform ?? "Unknown platform"} · checked {fmtDate(check.createdAt)}
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {check.report.capabilities.map((c) => (
                <Badge key={c.key} tone={c.found ? "ok" : "bad"} title={c.detail}>
                  {c.found ? "✓" : "✗"} {c.label}
                </Badge>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-zinc-500">Problems</div>
            <ul className="list-disc pl-5">
              {check.report.issues.slice(0, 6).map((i) => (
                <li key={i.id}>{i.title}</li>
              ))}
            </ul>
            {check.report.issues.length > 6 && <div className="text-zinc-500">+{check.report.issues.length - 6} more</div>}
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-zinc-500">Modules the site points to</div>
            <ul className="list-disc pl-5">
              {check.report.suggestions.map((x) => (
                <li key={x.moduleId}>{names[x.moduleId] ?? x.moduleId}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <p className="mt-1 text-sm text-zinc-500">No website check yet.</p>
      )}
    </div>
  );
}
