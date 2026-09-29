"use client";

import { useRef, useState } from "react";
import { ecoCoverage } from "@/lib/needsAnalyzer/rules";
import { TOOL_STATUSES, type Catalog, type Ecosystem, type EcoTool } from "@/lib/needsAnalyzer/types";
import { Badge, BTN, BTN_DANGER, BTN_PRIMARY, CARD, CAT_STYLE, csvCell, download, INPUT, NaShell, Stat, uid, useClientMode, useDebouncedSave, useToast } from "./ui";

export default function EcosystemEditor(props: { catalog: Catalog; initial: Ecosystem }) {
  return (
    <NaShell active="ecosystem">
      <Body {...props} />
    </NaShell>
  );
}

const ORDER = { gap: 0, unconfirmed: 1, ready: 2 };
const tone = (s: string) => (s === "ready" ? "ok" : s === "gap" ? "bad" : "warn") as "ok" | "bad" | "warn";

function Body({ catalog, initial }: { catalog: Catalog; initial: Ecosystem }) {
  const toast = useToast();
  const { on: clientMode } = useClientMode();
  const [eco, setEco] = useState(initial);
  const ecoRef = useRef(initial);
  const [newCap, setNewCap] = useState("");
  const { schedule } = useDebouncedSave<Ecosystem>(async (v) => {
    try {
      const r = await fetch("/api/admin/needs-analyzer/settings/ecosystem", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(v),
        keepalive: true,
      });
      if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error || r.statusText);
      toast("Ecosystem saved");
    } catch (e) {
      toast("Save failed: " + (e as Error).message);
    }
  }, 700);

  const change = (fn: (e: Ecosystem) => Ecosystem) => {
    ecoRef.current = fn(ecoRef.current);
    setEco(ecoRef.current);
    schedule(ecoRef.current);
  };
  const setTool = (i: number, patch: Partial<EcoTool>) => change((e) => ({ ...e, tools: e.tools.map((t, j) => (j === i ? { ...t, ...patch } : t)) }));

  if (clientMode) return <div className={`${CARD} text-zinc-500`}>The ecosystem is hidden in Client mode.</div>;

  const cov = ecoCoverage(catalog, eco).sort((x, y) => ORDER[x.status] - ORDER[y.status]);
  const caps = eco.capabilities || [];
  const counts = { ready: cov.filter((c) => c.status === "ready").length, unconfirmed: cov.filter((c) => c.status === "unconfirmed").length, gap: cov.filter((c) => c.status === "gap").length };
  const capName = (id: string) => caps.find((c) => c.id === id)?.name || id;

  function exportCsv() {
    const rows: unknown[][] = [
      ["Tool", "Type", "Status", "Used by", "Provides", "Notes"],
      ...(eco.tools || []).map((x) => [x.name, x.type, x.status, x.usedBy, (x.provides || []).map(capName), x.notes]),
    ];
    rows.push([], ["Capability", "Status", "Provided by", "Modules that depend on it"]);
    cov.forEach((c) => rows.push([c.name, c.status, c.tools.map((x) => x.name), c.modules.map((m) => m.name)]));
    download("revalor-ecosystem.csv", rows.map((r) => r.map(csvCell).join(",")).join("\n"), "text/csv");
  }

  function addCap() {
    const name = newCap.trim();
    if (!name) return;
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (!id || caps.some((c) => c.id === id)) {
      toast("That capability already exists");
      return;
    }
    change((e) => ({ ...e, capabilities: [...e.capabilities, { id, name, description: "" }] }));
    setNewCap("");
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Ecosystem</h1>
          <p className="text-sm text-zinc-500">Every tool, database and service Revalor and VisionWorkx run on, and what they let you deliver.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" className={BTN} onClick={exportCsv}>
            Export CSV
          </button>
          <button type="button" className={BTN} onClick={() => download("revalor-ecosystem.json", JSON.stringify(eco, null, 2), "application/json")}>
            Export JSON
          </button>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Covered" value={counts.ready} valueClass="!text-emerald-700" sub="capabilities with a tool in use" />
        <Stat label="Unconfirmed" value={counts.unconfirmed} valueClass="!text-amber-700" sub='tool listed but status not "In use"' />
        <Stat label="Gaps" value={counts.gap} valueClass="!text-red-700" sub="no tool provides it yet" />
        <Stat label="Tools" value={(eco.tools || []).length} />
      </div>

      <div className={CARD}>
        <h3 className="mb-2 font-semibold text-zinc-900">Coverage: what the catalog needs vs what you have</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
                <th className="py-2 pr-3">Capability</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Provided by</th>
                <th className="py-2">Modules that depend on it</th>
              </tr>
            </thead>
            <tbody>
              {cov.map((c) => (
                <tr key={c.id} className="border-b border-zinc-100 align-top">
                  <td className="py-2 pr-3">
                    <strong>{c.name}</strong>
                    <div className="text-xs text-zinc-500">{c.description}</div>
                  </td>
                  <td className="py-2 pr-3">
                    <Badge tone={tone(c.status)}>{c.status === "ready" ? "Covered" : c.status === "gap" ? "Gap" : "Unconfirmed"}</Badge>
                  </td>
                  <td className="py-2 pr-3 text-zinc-600">{c.tools.map((t) => `${t.name} (${t.status})`).join(", ") || <span className="text-zinc-400">—</span>}</td>
                  <td className="py-2">
                    <div className="flex flex-wrap gap-1">
                      {c.modules.map((m) => (
                        <Badge key={m.id} className={CAT_STYLE[m.category] || ""}>
                          {m.name}
                        </Badge>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className={CARD}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-zinc-900">Tools & databases</h3>
          <button
            type="button"
            className={BTN_PRIMARY}
            onClick={() => change((e) => ({ ...e, tools: [...e.tools, { id: "tool-" + uid(), name: "New tool", type: "", status: "To confirm", usedBy: [], provides: [], notes: "" }] }))}
          >
            + Add tool
          </button>
        </div>
        <p className="mb-2 mt-1 text-sm text-zinc-500">Edit in place; changes save automatically. Tick the capabilities each tool provides.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
                <th className="min-w-[170px] py-2 pr-2">Tool</th>
                <th className="py-2 pr-2">Type</th>
                <th className="py-2 pr-2">Status</th>
                <th className="min-w-[140px] py-2 pr-2">Used by</th>
                <th className="min-w-[240px] py-2 pr-2">Provides</th>
                <th className="min-w-[200px] py-2 pr-2">Notes</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(eco.tools || []).map((t, i) => (
                <tr key={t.id} className="border-b border-zinc-100 align-top">
                  <td className="py-2 pr-2">
                    <input className={INPUT} value={t.name} aria-label="Tool name" onChange={(e) => setTool(i, { name: e.target.value })} />
                  </td>
                  <td className="py-2 pr-2">
                    <input className={`${INPUT} w-32`} value={t.type} aria-label="Type" onChange={(e) => setTool(i, { type: e.target.value })} />
                  </td>
                  <td className="py-2 pr-2">
                    <select className={`${INPUT} w-auto`} value={t.status} aria-label="Status" onChange={(e) => setTool(i, { status: e.target.value })}>
                      {TOOL_STATUSES.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 pr-2">
                    <UsedByInput value={t.usedBy || []} onChange={(usedBy) => setTool(i, { usedBy })} />
                  </td>
                  <td className="py-2 pr-2">
                    <details>
                      <summary className="cursor-pointer text-xs text-zinc-600">{(t.provides || []).length ? (t.provides || []).map(capName).join(", ") : "None"}</summary>
                      {caps.map((c) => (
                        <label key={c.id} className="block text-xs">
                          <input
                            type="checkbox"
                            className="mr-1"
                            checked={(t.provides || []).includes(c.id)}
                            onChange={(e) => {
                              const set = new Set(t.provides || []);
                              if (e.target.checked) set.add(c.id);
                              else set.delete(c.id);
                              setTool(i, { provides: [...set] });
                            }}
                          />
                          {c.name}
                        </label>
                      ))}
                    </details>
                  </td>
                  <td className="py-2 pr-2">
                    <textarea className={`${INPUT} min-h-[60px]`} value={t.notes || ""} aria-label="Notes" onChange={(e) => setTool(i, { notes: e.target.value })} />
                  </td>
                  <td className="py-2">
                    <button
                      type="button"
                      className={BTN_DANGER}
                      aria-label={`Remove ${t.name}`}
                      onClick={() => {
                        if (confirm(`Remove "${t.name}"?`)) change((e) => ({ ...e, tools: e.tools.filter((_, j) => j !== i) }));
                      }}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className={CARD}>
        <h3 className="font-semibold text-zinc-900">Capabilities</h3>
        <p className="mb-2 mt-1 text-sm text-zinc-500">The building blocks modules depend on. Link modules to capabilities under Catalog & pricing.</p>
        <table className="w-full text-sm">
          <tbody>
            {caps.map((c, i) => (
              <tr key={c.id}>
                <td className="w-[30%] py-1 pr-2">
                  <input
                    className={INPUT}
                    value={c.name}
                    aria-label="Capability name"
                    onChange={(e) => change((x) => ({ ...x, capabilities: x.capabilities.map((y, j) => (j === i ? { ...y, name: e.target.value } : y)) }))}
                  />
                </td>
                <td className="py-1 pr-2">
                  <input
                    className={INPUT}
                    value={c.description}
                    aria-label="Description"
                    onChange={(e) => change((x) => ({ ...x, capabilities: x.capabilities.map((y, j) => (j === i ? { ...y, description: e.target.value } : y)) }))}
                  />
                </td>
                <td className="whitespace-nowrap py-1 text-xs text-zinc-400">{c.id}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-3 flex gap-2">
          <input className={`${INPUT} max-w-sm`} placeholder='New capability, e.g. "SMS messaging"' value={newCap} onChange={(e) => setNewCap(e.target.value)} />
          <button type="button" className={BTN} onClick={addCap}>
            + Add capability
          </button>
        </div>
      </div>
    </>
  );
}

// Comma-separated list edited as text; parsed on blur so typing a comma doesn't fight the cursor.
function UsedByInput({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [text, setText] = useState(value.join(", "));
  return (
    <input
      className={INPUT}
      value={text}
      placeholder="comma-separated"
      aria-label="Used by"
      onChange={(e) => setText(e.target.value)}
      onBlur={() =>
        onChange(
          text
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean),
        )
      }
    />
  );
}
