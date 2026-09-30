"use client";

import type { ReactNode } from "react";
import type { Catalog, WebsiteBuild } from "@/lib/needsAnalyzer/types";
import {
  ACCESS_METHODS,
  BUILD_PATHS,
  BUILDER_TOOLS,
  DEFAULT_BUILD_DAYS,
  HANDOFF_LABELS,
  PIECE_LABELS,
  REGISTRARS,
  websiteBuildProgress,
  websiteBuildSummary,
} from "@/lib/needsAnalyzer/websiteBuild";
import { Badge, BTN_PRIMARY, CARD, INPUT, moneyFmt, NUM } from "./ui";

// Operator-only build runbook for a client's website (hidden in Client mode). It
// records the build path, domain/DNS, the business pieces and handoff, and the
// commercials, then optionally surfaces a client-safe summary in the proposal.

type Pieces = NonNullable<WebsiteBuild["pieces"]>;
type Handoff = NonNullable<WebsiteBuild["handoff"]>;

export default function WebsiteBuilder({
  wb,
  setWb,
  catalog,
  go,
  saveState,
}: {
  wb: WebsiteBuild;
  setWb: (patch: Partial<WebsiteBuild>) => void;
  catalog: Catalog;
  go: (t: "proposal") => void;
  saveState: string;
}) {
  const m = moneyFmt(catalog);
  const prog = websiteBuildProgress(wb);
  const summary = websiteBuildSummary({ ...wb, showInProposal: true }, catalog); // preview ignores the toggle
  const setPiece = (k: keyof Pieces, v: boolean) => setWb({ pieces: { ...(wb.pieces || {}), [k]: v } });
  const setHandoff = (k: keyof Handoff, v: boolean) => setWb({ handoff: { ...(wb.handoff || {}), [k]: v } });

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Website builder</h1>
          <p className="text-sm text-zinc-500">
            The framework for actually building this client&apos;s site — path, domain, the pieces every site needs, and handoff. <span className="text-xs">{saveState}</span>
          </p>
        </div>
        <button type="button" className={BTN_PRIMARY} onClick={() => go("proposal")}>
          Open proposal →
        </button>
      </div>

      {/* 1 — Build path */}
      <div className={CARD}>
        <SectionHead n="1" title="Build path" hint="One of two ways to build. Pick the one that fits the client and the engagement." />
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {BUILD_PATHS.map((p) => {
            const on = wb.path === p.key;
            return (
              <button
                key={p.key}
                type="button"
                aria-pressed={on}
                onClick={() => setWb({ path: on ? "" : p.key })}
                className={`rounded-xl border p-4 text-left transition ${on ? "border-teal-600 bg-teal-50 ring-2 ring-teal-100" : "border-zinc-200 bg-white hover:border-zinc-300"}`}
              >
                <div className="flex items-center justify-between">
                  <strong className="text-zinc-900">{p.label}</strong>
                  {on && <Badge tone="accent">Chosen</Badge>}
                </div>
                <p className="mt-1 text-sm text-zinc-600">{p.tagline}</p>
                <ul className="mt-2 list-disc pl-5 text-sm text-zinc-600">
                  {p.points.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-amber-800">⚠ {p.caveat}</p>
              </button>
            );
          })}
        </div>

        {wb.path === "builder" && (
          <div className="mt-4">
            <Label>Which builder?</Label>
            <div className="flex flex-wrap gap-2">
              {BUILDER_TOOLS.map((t) => (
                <Chip key={t} on={wb.builderTool === t} onClick={() => setWb({ builderTool: wb.builderTool === t ? "" : t })}>
                  {t}
                </Chip>
              ))}
              <input
                className={`${INPUT} max-w-[220px]`}
                placeholder="Or type another"
                value={BUILDER_TOOLS.includes((wb.builderTool || "") as (typeof BUILDER_TOOLS)[number]) ? "" : wb.builderTool || ""}
                onChange={(e) => setWb({ builderTool: e.target.value })}
              />
            </div>
          </div>
        )}

        {wb.path === "custom" && (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Label className="mb-0">Monthly retainer (hosting + maintenance)</Label>
            <span className="flex items-center gap-1 text-sm text-zinc-600">
              {catalog.settings.currency || "$"}
              <input
                className={NUM}
                type="number"
                min={0}
                value={wb.monthlyMaintenance ?? ""}
                onChange={(e) => setWb({ monthlyMaintenance: e.target.value === "" ? undefined : Number(e.target.value) })}
              />
              /mo
            </span>
            <span className="text-xs text-zinc-500">A Revalor-hosted site only makes sense on a retainer.</span>
          </div>
        )}
      </div>

      {/* 2 — Domain & DNS */}
      <div className={CARD}>
        <SectionHead n="2" title="Domain & DNS" hint="Same for either path: the client owns the domain, in their name. Never register it in Revalor's name." />
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <Label>Domain</Label>
            <input className={INPUT} placeholder="clientbusiness.com" value={wb.domain || ""} onChange={(e) => setWb({ domain: e.target.value })} />
          </div>
          <div>
            <Label>Registrar</Label>
            <div className="flex flex-wrap gap-2">
              {REGISTRARS.map((r) => (
                <Chip key={r} on={wb.registrar === r} onClick={() => setWb({ registrar: wb.registrar === r ? "" : r })}>
                  {r}
                </Chip>
              ))}
              <input
                className={`${INPUT} max-w-[180px]`}
                placeholder="Other"
                value={REGISTRARS.includes((wb.registrar || "") as (typeof REGISTRARS)[number]) ? "" : wb.registrar || ""}
                onChange={(e) => setWb({ registrar: e.target.value })}
              />
            </div>
          </div>
        </div>
        <div className="mt-4">
          <Label>How Revalor gets access (never their password)</Label>
          <div className="flex flex-wrap gap-2">
            {ACCESS_METHODS.map((a) => (
              <Chip key={a} on={wb.accessMethod === a} onClick={() => setWb({ accessMethod: wb.accessMethod === a ? "" : a })}>
                {a}
              </Chip>
            ))}
          </div>
        </div>
        <div className="mt-4 space-y-2">
          <Check on={!!wb.domainOwnedByClient} onChange={(v) => setWb({ domainOwnedByClient: v })}>
            Domain registered in the <strong>client&apos;s</strong> name (~$10–20/yr for a .com)
          </Check>
          <Check on={!!wb.hasExistingEmail} onChange={(v) => setWb({ hasExistingEmail: v })}>
            Client already uses email on this domain
          </Check>
          {wb.hasExistingEmail && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              ⚠ <strong>Don&apos;t touch the MX (email) records.</strong> Breaking their email is the most common mistake here — change only the records the host tells you to.
            </div>
          )}
          <Check on={!!wb.dnsDone} onChange={(v) => setWb({ dnsDone: v })}>
            Domain pointed at the host (A/CNAME per the host; SSL set up)
          </Check>
        </div>
      </div>

      {/* 3 — Business pieces */}
      <div className={CARD}>
        <SectionHead n="3" title="Pieces every site should have" hint={`${prog.piecesDone}/${prog.piecesTotal} in place`} />
        <div className="mt-4 space-y-2">
          {PIECE_LABELS.map((p) => (
            <Check key={p.key} on={!!wb.pieces?.[p.key]} onChange={(v) => setPiece(p.key, v)}>
              {p.label}
            </Check>
          ))}
        </div>
      </div>

      {/* 4 — Handoff */}
      <div className={CARD}>
        <SectionHead n="4" title="Handoff checklist" hint={`${prog.handoffDone}/${prog.handoffTotal} done`} />
        <div className="mt-4 space-y-2">
          {HANDOFF_LABELS.map((h) => (
            <Check key={h.key} on={!!wb.handoff?.[h.key]} onChange={(v) => setHandoff(h.key, v)}>
              {h.label}
            </Check>
          ))}
        </div>
      </div>

      {/* 5 — Effort & timeline */}
      <div className={CARD}>
        <SectionHead n="5" title="Effort & timeline" hint="A simple 3–5 page site: ~1–3 days build + half a day domain/DNS. Most waiting is on the client for content and access." />
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <Label>Build effort</Label>
            <input className={INPUT} placeholder={DEFAULT_BUILD_DAYS} value={wb.buildDays || ""} onChange={(e) => setWb({ buildDays: e.target.value })} />
          </div>
          <div>
            <Label>Timeline notes (shown to the client if set)</Label>
            <input className={INPUT} placeholder="e.g. Live within 2 weeks of receiving content" value={wb.timelineNotes || ""} onChange={(e) => setWb({ timelineNotes: e.target.value })} />
          </div>
        </div>
      </div>

      {/* 6 — Client proposal */}
      <div className={CARD}>
        <SectionHead n="6" title="Client proposal" hint="Add a client-safe website section to the proposal. Never shows effort or margin." />
        <div className="mt-4">
          <Check on={!!wb.showInProposal} onChange={(v) => setWb({ showInProposal: v })}>
            Show a <strong>&ldquo;Your website&rdquo;</strong> section in the client proposal
          </Check>
        </div>
        <div className="mt-4">
          <Label>Custom summary (optional — leave blank to build one from the fields above)</Label>
          <textarea
            className={`${INPUT} min-h-[80px]`}
            placeholder="Override the auto-generated wording here if you want."
            value={wb.clientSummary || ""}
            onChange={(e) => setWb({ clientSummary: e.target.value })}
          />
        </div>
        <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Client sees</div>
          {wb.clientSummary?.trim() ? (
            <p className="text-sm text-zinc-700">{wb.clientSummary}</p>
          ) : summary ? (
            <div className="space-y-1 text-sm text-zinc-700">
              <p>{summary.approach}</p>
              {summary.domain && <p>{summary.domain}</p>}
              {summary.included.length > 0 && <p>Included: {summary.included.join(", ")}.</p>}
              {summary.maintenance && <p>{summary.maintenance}</p>}
              {summary.timeline && <p>Timeline: {summary.timeline}.</p>}
              {summary.handoff && <p>{summary.handoff}</p>}
            </div>
          ) : (
            <p className="text-sm text-zinc-400">Pick a build path above to preview the client wording.</p>
          )}
          {wb.path === "custom" && wb.monthlyMaintenance ? (
            <p className="mt-2 text-xs text-zinc-500">Retainer on the proposal: {m(wb.monthlyMaintenance)}/mo.</p>
          ) : null}
        </div>
      </div>
    </>
  );
}

function SectionHead({ n, title, hint }: { n: string; title: string; hint?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#1A3A5C] text-sm font-bold text-white">{n}</span>
      <h2 className="text-lg font-bold text-zinc-900">{title}</h2>
      {hint && <span className="text-sm text-zinc-500">{hint}</span>}
    </div>
  );
}

function Label({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mb-1.5 text-sm font-semibold text-zinc-800 ${className}`}>{children}</div>;
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
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

function Check({ on, onChange, children }: { on: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start gap-2 text-sm text-zinc-700">
      <input type="checkbox" className="mt-0.5 h-4 w-4" checked={on} onChange={(e) => onChange(e.target.checked)} />
      <span>{children}</span>
    </label>
  );
}
