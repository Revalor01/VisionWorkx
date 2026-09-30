/* eslint-disable @next/next/no-img-element -- logos are operator-set external addresses */
import type { ReactNode } from "react";
import { logoUrl, moduleLogoSlot } from "@/lib/needsAnalyzer/brand";
import { fmtDate, money } from "@/lib/needsAnalyzer/format";
import { situation, type Plan } from "@/lib/needsAnalyzer/rules";
import type { Answers, Catalog, WebsiteBuild } from "@/lib/needsAnalyzer/types";
import { websiteBuildSummary } from "@/lib/needsAnalyzer/websiteBuild";

// The client-facing proposal. Rendered inside /admin/needs-analyzer/<id> (Proposal
// tab) and on the public /proposal/<token> page, so it must only ever show
// client-safe content: no fit scores, flags, effort, margin or consultant notes.
// No hooks, so it works as a server or client component.

export interface SiteFindings {
  site: string;
  items: { title: string; detail: string }[];
}

export function Proposal({
  answers: A,
  plan: P,
  catalog,
  prepared,
  siteFindings,
  websiteBuild,
}: {
  answers: Answers;
  plan: Plan;
  catalog: Catalog;
  prepared: string | Date;
  /** Only the website-check issues the operator ticked for the proposal. */
  siteFindings?: SiteFindings | null;
  /** The build runbook from the Website builder tab; a client-safe summary shows when the operator opted in. */
  websiteBuild?: WebsiteBuild | null;
}) {
  const co = catalog.company;
  const st = catalog.settings;
  const m = (n: number) => money(st.currency, n);
  const sit = situation(A);
  const preparedAt = new Date(prepared);
  const valid = new Date(preparedAt.getTime() + (Number(st.proposalValidDays) || 30) * 864e5);
  const headerLogo = logoUrl(catalog, "consulting") || logoUrl(catalog, "business");
  const badgeLogo = logoUrl(catalog, "badge");
  const goals = (A.goals as string[] | undefined) || [];
  const phase1 = P.phases.find((p) => p.key === "1");
  const bizName = String(A.bizName || "");
  const web = websiteBuildSummary(websiteBuild ?? undefined, catalog);
  const webCustom = (websiteBuild?.clientSummary || "").trim();
  const logoFor = (it: { id: string; category: string }) => {
    const slot = moduleLogoSlot(catalog, it);
    const url = slot ? logoUrl(catalog, slot) : null;
    return url ? <img referrerPolicy="no-referrer" src={url} alt="" className="h-5 w-5 rounded object-contain" /> : null;
  };

  return (
    <article className="mx-auto max-w-[850px] rounded-xl border border-zinc-200 bg-white p-8 text-zinc-800 shadow-sm print:max-w-none print:border-0 print:p-0 print:shadow-none">
      <header
        className={`-mx-8 -mt-8 mb-8 flex flex-wrap items-center justify-between gap-4 rounded-t-xl border-b-4 border-[#b7862b] px-8 py-6 print:mx-0 print:mt-0 ${st.proposalDarkHeader ? "bg-[#1f2a44] text-white" : "bg-white"}`}
      >
        <div className="flex items-center gap-4">
          {headerLogo && <img referrerPolicy="no-referrer" src={headerLogo} alt={co.name} className="h-14 w-auto max-w-[180px] object-contain" />}
          <div>
            <div className="text-xl font-bold">{co.name}</div>
            <div className={`text-sm ${st.proposalDarkHeader ? "text-white/75" : "text-zinc-500"}`}>
              {co.tagline}
              {co.badge && !badgeLogo ? ` · ${co.badge}` : ""}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className={`text-right text-sm ${st.proposalDarkHeader ? "text-white/80" : "text-zinc-600"}`}>
            {co.consultant && <div>{co.consultant}</div>}
            <div>{co.email}</div>
            <div>{co.website}</div>
          </div>
          {badgeLogo && <img referrerPolicy="no-referrer" src={badgeLogo} alt={co.badge} className="h-14 w-auto object-contain" />}
        </div>
      </header>

      <h1 className="text-3xl font-bold text-zinc-900">Build plan for {bizName || "your business"}</h1>
      <p className="mt-1 text-zinc-500">
        Prepared for {String(A.contactName || bizName || "you")} · {fmtDate(preparedAt)}
      </p>

      {sit.length > 0 && (
        <>
          <H2>What we heard</H2>
          <ul className="list-disc space-y-1 pl-5">
            {sit.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </>
      )}
      {siteFindings && siteFindings.items.length > 0 && (
        <>
          <H2>What we found on {siteFindings.site}</H2>
          <ul className="list-disc space-y-1 pl-5">
            {siteFindings.items.map((f) => (
              <li key={f.title}>
                <strong>{f.title}.</strong> {f.detail}
              </li>
            ))}
          </ul>
        </>
      )}
      {goals.length > 0 && (
        <p className="mt-3">
          <strong>Your priorities:</strong> {goals.join(", ")}.
        </p>
      )}
      {A.topPains ? (
        <p className="mt-2">
          <strong>In your words:</strong> “{String(A.topPains)}”
        </p>
      ) : null}

      <H2>Recommended plan</H2>
      {P.phases.length ? (
        P.phases.map((ph) => (
          <section key={ph.key} className="mt-5 break-inside-avoid-page">
            <h3 className="text-lg font-semibold text-zinc-900">
              {ph.name} <span className="text-sm font-normal text-zinc-500">· {ph.timing}</span>
            </h3>
            {ph.items.map((it) => (
              <div key={it.id} className="mt-2 break-inside-avoid border-l-2 border-zinc-200 py-1 pl-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <span className="flex items-center gap-2 font-semibold text-zinc-900">
                    {logoFor(it)}
                    {it.name}
                    {it.qty > 1 ? ` × ${it.qty}` : ""}
                  </span>
                  <span className="whitespace-nowrap text-sm">
                    {it.setupTotal ? `${m(it.setupTotal)} setup` : it.monthlyTotal ? "No setup fee" : "Included"}
                    {it.monthlyTotal ? ` · ${m(it.monthlyTotal)}/mo` : ""}
                  </span>
                </div>
                <div className="text-sm text-zinc-600">{it.description}</div>
                {it.reasons.length > 0 && <div className="mt-0.5 text-sm italic text-zinc-500">Why: {it.reasons.slice(0, 2).join("; ")}.</div>}
              </div>
            ))}
          </section>
        ))
      ) : (
        <p className="text-zinc-500">Plan to be finalised.</p>
      )}

      <H2>Investment</H2>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-300 text-left text-zinc-500">
            <th className="py-2 font-medium">Phase</th>
            <th className="py-2 text-right font-medium">One-time</th>
            <th className="py-2 text-right font-medium">Monthly</th>
          </tr>
        </thead>
        <tbody>
          {P.phases.map((ph) => (
            <tr key={ph.key} className="border-b border-zinc-100">
              <td className="py-2">{ph.name}</td>
              <td className="py-2 text-right">{m(ph.setup)}</td>
              <td className="py-2 text-right">{m(ph.monthly)}</td>
            </tr>
          ))}
          {P.discount > 0 && (
            <tr className="border-b border-zinc-100">
              <td className="py-2">Founding-client discount ({P.discountPct}%)</td>
              <td className="py-2 text-right">−{m(P.discount)}</td>
              <td />
            </tr>
          )}
          <tr className="font-bold text-zinc-900">
            <td className="py-2">Total</td>
            <td className="py-2 text-right">{m(P.setupNet)}</td>
            <td className="py-2 text-right">{m(P.monthly)}/mo</td>
          </tr>
        </tbody>
      </table>
      <p className="mt-2 text-sm text-zinc-500">Phases can be started one at a time. Phase 1 alone is {m(phase1?.setup || 0)} to start.</p>

      {(P.hoursSaved > 0 || P.extraRevenue > 0) && (
        <>
          <H2>Estimated impact</H2>
          <ul className="list-disc space-y-1 pl-5">
            {P.hoursSaved > 0 && (
              <li>
                About <strong>{P.hoursSaved} hours a week</strong> back from admin and manual work.
              </li>
            )}
            {P.extraRevenue > 0 && (
              <li>
                About <strong>{P.recoveredLeads} more leads a month</strong> answered and followed up, worth roughly <strong>{m(P.extraRevenue)} a month</strong>.
              </li>
            )}
            {P.paybackMonths ? (
              <li>
                Estimated payback in about{" "}
                <strong>
                  {P.paybackMonths} month{P.paybackMonths > 1 ? "s" : ""}
                </strong>
                .
              </li>
            ) : null}
          </ul>
          <p className="mt-2 text-sm text-zinc-500">Estimates are based on what you shared during our conversation, not a guarantee.</p>
        </>
      )}

      {web && (
        <section className="break-inside-avoid-page">
          <H2>Your website</H2>
          {webCustom ? (
            <p>{webCustom}</p>
          ) : (
            <>
              <p>{web.approach}</p>
              {web.domain && <p className="mt-2">{web.domain}</p>}
              {web.included.length > 0 && (
                <p className="mt-2">
                  <strong>Included:</strong> {web.included.join(", ")}.
                </p>
              )}
              {web.maintenance && <p className="mt-2">{web.maintenance}</p>}
              {web.timeline && (
                <p className="mt-2">
                  <strong>Timeline:</strong> {web.timeline}.
                </p>
              )}
              {web.handoff && <p className="mt-2">{web.handoff}</p>}
            </>
          )}
        </section>
      )}

      <H2>Next steps</H2>
      <ol className="list-decimal space-y-1 pl-5">
        <li>Review this plan and tell us what to add, remove or reorder.</li>
        <li>
          Agree the Phase 1 scope and a start date
          {P.items.some((i) => i.category === "Custom Build") ? "; custom builds begin with a short discovery session and a fixed-price spec" : ""}.
        </li>
        <li>We build, install on your existing website, and walk your team through it.</li>
      </ol>
      <p className="mt-8 border-t border-zinc-200 pt-4 text-xs text-zinc-500">
        This proposal is valid until {fmtDate(valid)}. Prices are in {st.currency || "$"} and exclude any third-party fees (e.g. payment processing). {co.name} · {co.email}
      </p>
    </article>
  );
}

function H2({ children }: { children: ReactNode }) {
  return <h2 className="mb-2 mt-8 text-xl font-bold text-[#1f2a44]">{children}</h2>;
}
