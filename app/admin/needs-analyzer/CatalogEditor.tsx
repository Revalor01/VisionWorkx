"use client";

/* eslint-disable @next/next/no-img-element -- logos are operator-set external addresses */
import { useRef, useState } from "react";
import { DEFAULT_LOGOS, LOGO_LABELS, logoUrl } from "@/lib/needsAnalyzer/brand";
import { DEFAULT_CATALOG } from "@/lib/needsAnalyzer/defaults";
import { CATEGORIES, LOGO_SLOTS, type Catalog, type CatalogModule, type Ecosystem, type LogoSlot } from "@/lib/needsAnalyzer/types";
import { BTN, BTN_DANGER, BTN_PRIMARY, CARD, INPUT, NaShell, NUM, uid, useClientMode, useDebouncedSave, useToast } from "./ui";

export default function CatalogEditor(props: { initial: Catalog; ecosystem: Ecosystem }) {
  return (
    <NaShell active="catalog">
      <Body {...props} />
    </NaShell>
  );
}

const SETTINGS: [keyof Catalog["settings"], string, "text" | "number"][] = [
  ["currency", "Currency symbol", "text"],
  ["clientHourValue", "Value of client's time ($/hour)", "number"],
  ["internalRate", "Your internal cost ($/hour)", "number"],
  ["closeRate", "Lead close rate (%)", "number"],
  ["includeThreshold", "Auto-recommend at fit score ≥", "number"],
  ["proposalValidDays", "Proposal valid (days)", "number"],
  ["discountPct", "Default setup discount (%)", "number"],
];
const COMPANY: [keyof Catalog["company"], string][] = [
  ["name", "Company name"],
  ["tagline", "Tagline"],
  ["badge", "Badge"],
  ["consultant", "Your name"],
  ["email", "Email"],
  ["website", "Website"],
];
const NUM_FIELDS = ["setup", "monthly", "effortHours", "hoursSavedPerWeek"] as const;

function Body({ initial, ecosystem }: { initial: Catalog; ecosystem: Ecosystem }) {
  const toast = useToast();
  const { on: clientMode } = useClientMode();
  const [C, setC] = useState(initial);
  const ref = useRef(initial);
  const { schedule, flush } = useDebouncedSave<Catalog>(async (v) => {
    try {
      const r = await fetch("/api/admin/needs-analyzer/settings/catalog", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(v),
        keepalive: true,
      });
      if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error || r.statusText);
      toast("Catalog saved");
    } catch (e) {
      toast("Save failed: " + (e as Error).message);
    }
  }, 700);

  const change = (fn: (c: Catalog) => Catalog) => {
    ref.current = fn(ref.current);
    setC(ref.current);
    schedule(ref.current);
  };
  const setModule = (i: number, patch: Partial<CatalogModule>) => change((c) => ({ ...c, modules: c.modules.map((m, j) => (j === i ? { ...m, ...patch } : m)) }));
  const setLogo = (slot: LogoSlot, url: string) => change((c) => ({ ...c, settings: { ...c.settings, logos: { ...(c.settings.logos || {}), [slot]: url } } }));

  if (clientMode) return <div className={`${CARD} text-zinc-500`}>Catalog & pricing is hidden in Client mode.</div>;

  const st = C.settings;
  const caps = ecosystem.capabilities || [];

  return (
    <>
      <h1 className="text-2xl font-bold text-zinc-900">Catalog & pricing</h1>
      <p className="mb-4 text-sm text-zinc-500">Everything the analyzer recommends comes from here. Prices that ship with the app are placeholders; set your own.</p>

      <div className={CARD}>
        <h3 className="font-semibold text-zinc-900">Brand logos</h3>
        <p className="mb-3 mt-1 text-sm text-zinc-500">
          Each logo is an image address (https). They default to the official files on products.revalorllc.com. Clear one to hide it.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {LOGO_SLOTS.map((slot) => {
            const [label, where] = LOGO_LABELS[slot];
            const url = logoUrl(C, slot);
            const value = st.logos?.[slot] ?? DEFAULT_LOGOS[slot];
            return (
              <div key={slot} className="rounded-lg border border-zinc-200 p-3">
                <div className={`mb-2 flex h-16 items-center justify-center rounded ${st.proposalDarkHeader || slot === "business" ? "bg-[#1f2a44]" : "bg-zinc-50"}`}>
                  {url ? <img src={url} alt={label} className="max-h-14 max-w-full object-contain" /> : <span className="text-xs text-zinc-400">No logo</span>}
                </div>
                <strong className="text-sm">{label}</strong>
                <div className="mb-2 text-xs text-zinc-500">{where}</div>
                <input className={INPUT} value={value} placeholder="https://…" aria-label={`${label} address`} onChange={(e) => setLogo(slot, e.target.value.trim())} />
                <div className="mt-2 flex gap-2">
                  {value !== DEFAULT_LOGOS[slot] && (
                    <button type="button" className={BTN} onClick={() => setLogo(slot, DEFAULT_LOGOS[slot])}>
                      Use default
                    </button>
                  )}
                  {value && (
                    <button type="button" className={BTN_DANGER} onClick={() => setLogo(slot, "")}>
                      Clear
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={!!st.proposalDarkHeader}
            onChange={(e) => change((c) => ({ ...c, settings: { ...c.settings, proposalDarkHeader: e.target.checked } }))}
          />
          Dark proposal header (use this if your logos are light-colored and made for dark backgrounds)
        </label>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className={CARD}>
          <h3 className="mb-3 font-semibold text-zinc-900">Company (shown on proposals)</h3>
          {COMPANY.map(([k, label]) => (
            <label key={k} className="mb-3 block text-sm">
              {label}
              <input className={`${INPUT} mt-1`} value={C.company[k] ?? ""} onChange={(e) => change((c) => ({ ...c, company: { ...c.company, [k]: e.target.value } }))} />
            </label>
          ))}
        </div>
        <div className={CARD}>
          <h3 className="mb-3 font-semibold text-zinc-900">Settings</h3>
          {SETTINGS.map(([k, label, type]) => (
            <label key={k} className="mb-3 block text-sm">
              {label}
              <input
                className={`${INPUT} mt-1`}
                type={type}
                value={String(st[k] ?? "")}
                onChange={(e) =>
                  change((c) => ({ ...c, settings: { ...c.settings, [k]: type === "number" ? (e.target.value === "" ? 0 : Number(e.target.value)) : e.target.value } }))
                }
              />
            </label>
          ))}
          <div className="mb-1 mt-4 text-sm font-semibold">Phases</div>
          {Object.entries(C.phases).map(([k, p]) => (
            <div key={k} className="mb-2 flex gap-2">
              <input
                className={`${INPUT} flex-[2]`}
                value={p.name}
                aria-label={`Phase ${k} name`}
                onChange={(e) => change((c) => ({ ...c, phases: { ...c.phases, [k]: { ...c.phases[k], name: e.target.value } } }))}
              />
              <input
                className={`${INPUT} flex-1`}
                value={p.timing}
                aria-label={`Phase ${k} timing`}
                onChange={(e) => change((c) => ({ ...c, phases: { ...c.phases, [k]: { ...c.phases[k], timing: e.target.value } } }))}
              />
            </div>
          ))}
        </div>
      </div>

      <div className={CARD}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold text-zinc-900">Modules</h3>
          <div className="flex gap-2">
            <button
              type="button"
              className={BTN_PRIMARY}
              onClick={() =>
                change((c) => ({
                  ...c,
                  modules: [
                    ...c.modules,
                    { id: "mod-" + uid(), name: "New module", category: "Custom Build", phase: 3, setup: 0, monthly: 0, effortHours: 0, hoursSavedPerWeek: 0, active: true, requires: [], description: "" },
                  ],
                }))
              }
            >
              + Add module
            </button>
            <button
              type="button"
              className={BTN_DANGER}
              onClick={() => {
                if (!confirm("Reset the whole catalog (modules, prices, company info, logos) to the defaults?")) return;
                change(() => DEFAULT_CATALOG);
                flush();
                toast("Catalog reset");
              }}
            >
              Reset to defaults
            </button>
          </div>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
                <th className="py-2 pr-2">On</th>
                <th className="min-w-[220px] py-2 pr-2">Module</th>
                <th className="py-2 pr-2">Category</th>
                <th className="py-2 pr-2">Phase</th>
                <th className="py-2 pr-2">Setup</th>
                <th className="py-2 pr-2">Monthly</th>
                <th className="py-2 pr-2">Effort h</th>
                <th className="py-2 pr-2">Saves h/wk</th>
                <th className="min-w-[180px] py-2">Needs (ecosystem)</th>
              </tr>
            </thead>
            <tbody>
              {C.modules.map((m, i) => (
                <tr key={m.id} className="border-b border-zinc-100 align-top">
                  <td className="py-2 pr-2">
                    <input type="checkbox" aria-label={`${m.name} on`} checked={m.active !== false} onChange={(e) => setModule(i, { active: e.target.checked })} />
                  </td>
                  <td className="py-2 pr-2">
                    <input className={INPUT} value={m.name} aria-label="Module name" onChange={(e) => setModule(i, { name: e.target.value })} />
                    <textarea
                      className={`${INPUT} mt-1 min-h-[54px] text-xs`}
                      value={m.description}
                      aria-label="Description"
                      onChange={(e) => setModule(i, { description: e.target.value })}
                    />
                  </td>
                  <td className="py-2 pr-2">
                    <select className={`${INPUT} w-auto`} value={m.category} aria-label="Category" onChange={(e) => setModule(i, { category: e.target.value })}>
                      {CATEGORIES.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 pr-2">
                    <select className={`${INPUT} w-auto`} value={m.phase} aria-label="Phase" onChange={(e) => setModule(i, { phase: Number(e.target.value) })}>
                      {[1, 2, 3].map((n) => (
                        <option key={n}>{n}</option>
                      ))}
                    </select>
                  </td>
                  {NUM_FIELDS.map((k) => (
                    <td key={k} className="py-2 pr-2">
                      <input
                        className={NUM}
                        type="number"
                        min={0}
                        step="any"
                        aria-label={k}
                        value={m[k] ?? ""}
                        onChange={(e) => setModule(i, { [k]: e.target.value === "" ? 0 : Number(e.target.value) })}
                      />
                    </td>
                  ))}
                  <td className="py-2">
                    <details>
                      <summary className="cursor-pointer text-xs text-zinc-600">{(m.requires || []).length} capabilities</summary>
                      {caps.map((c) => (
                        <label key={c.id} className="block text-xs">
                          <input
                            type="checkbox"
                            className="mr-1"
                            checked={(m.requires || []).includes(c.id)}
                            onChange={(e) => {
                              const set = new Set(m.requires || []);
                              if (e.target.checked) set.add(c.id);
                              else set.delete(c.id);
                              setModule(i, { requires: [...set] });
                            }}
                          />
                          {c.name}
                        </label>
                      ))}
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-sm text-zinc-500">
          New modules you add are only included when ticked on a plan; automatic scoring rules live in <code>lib/needsAnalyzer/rules.ts</code> (and the offline
          app&apos;s <code>public/rules.js</code>; keep the two the same).
        </p>
      </div>
    </>
  );
}
