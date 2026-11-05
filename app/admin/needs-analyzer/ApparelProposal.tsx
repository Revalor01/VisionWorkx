/* eslint-disable @next/next/no-img-element -- logos are operator-set external addresses */
import type { ReactNode } from "react";
import { logoUrl } from "@/lib/needsAnalyzer/brand";
import { fmtDate, money } from "@/lib/needsAnalyzer/format";
import type { Answers, ApparelPlan, Catalog } from "@/lib/needsAnalyzer/types";

// Client-facing apparel / merch proposal: compares the three delivery tiers with the
// recommended one highlighted, plus "what you'll provide". Client-safe only — no fit
// scores, margin or consultant notes. No hooks, so it works as a server or client
// component. Shared by /admin/needs-analyzer/<id> (Proposal tab) and /proposal/<token>.

export function ApparelProposal({
  answers: A,
  plan: P,
  catalog,
  prepared,
}: {
  answers: Answers;
  plan: ApparelPlan;
  catalog: Catalog;
  prepared: string | Date;
}) {
  const co = catalog.company;
  const st = catalog.settings;
  const m = (n: number) => money(st.currency, n);
  const preparedAt = new Date(prepared);
  const valid = new Date(preparedAt.getTime() + (Number(st.proposalValidDays) || 30) * 864e5);
  const headerLogo = logoUrl(catalog, "consulting") || logoUrl(catalog, "business");
  const badgeLogo = logoUrl(catalog, "badge");
  const bizName = String(A.bizName || "");
  const recommended = P.tiers.find((t) => t.recommended);
  const priceLine = (setup: number, monthly: number) =>
    setup && monthly ? `${m(setup)} setup · ${m(monthly)}/mo` : setup ? `${m(setup)} setup` : monthly ? `${m(monthly)}/mo` : "Included";

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

      <h1 className="text-3xl font-bold text-zinc-900">Custom apparel plan for {bizName || "your business"}</h1>
      <p className="mt-1 text-zinc-500">
        Prepared for {String(A.contactName || bizName || "you")} · {fmtDate(preparedAt)}
      </p>

      {recommended && (
        <>
          <H2>Our recommendation</H2>
          <p>
            We recommend <strong>Tier {recommended.tier} — {recommended.name}</strong>: {recommended.blurb}
          </p>
          {P.reasons.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {P.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}
        </>
      )}

      <H2>Three ways to do this</H2>
      {P.tiers.map((t) => (
        <section
          key={t.tier}
          className={`mt-4 break-inside-avoid rounded-lg border p-4 ${t.recommended ? "border-[#b7862b] bg-[#b7862b]/5" : "border-zinc-200"}`}
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h3 className="text-lg font-semibold text-zinc-900">
              Tier {t.tier} — {t.name}
              {t.recommended && <span className="ml-2 rounded bg-[#b7862b] px-2 py-0.5 text-xs font-semibold text-white">Recommended</span>}
            </h3>
            <span className="whitespace-nowrap text-sm font-semibold text-zinc-900">{priceLine(t.setup, t.monthly)}</span>
          </div>
          <p className="mt-1 text-sm text-zinc-600">{t.blurb}</p>
          {t.items.length > 0 && (
            <ul className="mt-3 space-y-2">
              {t.items.map((i) => (
                <li key={i.id} className="border-l-2 border-zinc-200 pl-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <span className="font-medium text-zinc-900">{i.name}</span>
                    <span className="whitespace-nowrap text-sm text-zinc-600">{priceLine(i.setup, i.monthly)}</span>
                  </div>
                  <div className="text-sm text-zinc-600">{i.description}</div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}

      {P.clientMustProvide.length > 0 && (
        <>
          <H2>What you&apos;ll provide</H2>
          <ul className="list-disc space-y-1 pl-5">
            {P.clientMustProvide.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </>
      )}

      <H2>Next steps</H2>
      <ol className="list-decimal space-y-1 pl-5">
        <li>Review the tiers and tell us which direction fits — we can mix and phase the work.</li>
        <li>Agree the scope and a start date; custom builds begin with a short discovery session and a fixed-price spec.</li>
        <li>We set up (or build), connect your products and artwork, and walk your team through it.</li>
      </ol>
      <p className="mt-8 border-t border-zinc-200 pt-4 text-xs text-zinc-500">
        This proposal is valid until {fmtDate(valid)}. Prices are in {st.currency || "$"} and exclude any third-party fees (platform subscriptions, payment processing and blank goods). {co.name} · {co.email}
      </p>
    </article>
  );
}

function H2({ children }: { children: ReactNode }) {
  return <h2 className="mb-2 mt-8 text-xl font-bold text-[#1f2a44]">{children}</h2>;
}
