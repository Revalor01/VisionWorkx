"use client";

import { useState } from "react";
import type { SiteCheck } from "@/lib/needsAnalyzer/siteChecks";
import type { SiteAiReview } from "@/lib/needsAnalyzer/siteReview";
import { fmtDate } from "@/lib/needsAnalyzer/format";
import { api, Badge, BTN, CARD, Stat, useToast, type Tone } from "./ui";

// The website check report: what the site can do, what's wrong with it, which
// modules fit, PageSpeed scores and the optional AI review. Issues can be ticked
// to show on the client proposal (only when the check belongs to an assessment).

const SEV_TONE: Record<string, Tone> = { high: "bad", medium: "warn", low: "plain" };
const scoreTone = (n: number | null) => (n === null ? "" : n >= 90 ? "!text-emerald-700" : n >= 50 ? "!text-amber-700" : "!text-red-700");

export function SiteReportView({
  check,
  setCheck,
  moduleNames,
  canTickForProposal,
}: {
  check: SiteCheck;
  setCheck: (c: SiteCheck) => void;
  moduleNames: Record<string, string>;
  canTickForProposal: boolean;
}) {
  const toast = useToast();
  const [aiBusy, setAiBusy] = useState(false);
  const r = check.report;
  const found = r.capabilities.filter((c) => c.found).length;

  async function toggleIssue(id: string, on: boolean) {
    const next = on ? [...check.proposalIssues, id] : check.proposalIssues.filter((x) => x !== id);
    setCheck({ ...check, proposalIssues: next });
    try {
      await api("PATCH", `/api/admin/needs-analyzer/site-check/${check.id}`, { proposalIssues: next });
    } catch (e) {
      toast((e as Error).message);
      setCheck(check);
    }
  }

  async function runAi() {
    setAiBusy(true);
    try {
      const review = await api<SiteAiReview>("POST", `/api/admin/needs-analyzer/site-check/${check.id}/ai`);
      setCheck({ ...check, aiReview: review });
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setAiBusy(false);
    }
  }

  return (
    <>
      <div className={CARD}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-zinc-900">
              <a href={r.finalUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">
                {r.finalUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}
              </a>
            </h2>
            <p className="text-sm text-zinc-500">
              Checked {fmtDate(check.createdAt)} · {r.pages.length} page{r.pages.length === 1 ? "" : "s"} read · Built on <strong>{r.platform ?? "unknown / custom"}</strong>
              {r.hosting && <> · Hosted on <strong>{r.hosting}</strong></>}
              {r.frameworks && r.frameworks.length > 0 && <> · Framework <strong>{r.frameworks.join(" · ")}</strong></>}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {r.tools.map((t) => (
              <Badge key={t}>{t}</Badge>
            ))}
          </div>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Capabilities found" value={`${found}/${r.capabilities.length}`} />
        <Stat label="Problems" value={r.issues.length} sub={`${r.issues.filter((i) => i.severity === "high").length} serious`} valueClass={r.issues.some((i) => i.severity === "high") ? "!text-red-700" : ""} />
        <Stat label="Modules that fit" value={r.suggestions.length} />
        <Stat label="Home page response" value={r.pages[0] ? `${(r.pages[0].ms / 1000).toFixed(1)} s` : "—"} />
      </div>

      {check.pagespeed && (
        <div className={CARD}>
          <h3 className="mb-3 font-semibold text-zinc-900">Google PageSpeed (phone)</h3>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Performance" value={check.pagespeed.scores.performance ?? "—"} valueClass={scoreTone(check.pagespeed.scores.performance)} />
            <Stat label="SEO" value={check.pagespeed.scores.seo ?? "—"} valueClass={scoreTone(check.pagespeed.scores.seo)} />
            <Stat label="Accessibility" value={check.pagespeed.scores.accessibility ?? "—"} valueClass={scoreTone(check.pagespeed.scores.accessibility)} />
            <Stat label="Best practices" value={check.pagespeed.scores.bestPractices ?? "—"} valueClass={scoreTone(check.pagespeed.scores.bestPractices)} />
          </div>
          {check.pagespeed.metrics.lcpMs !== null && (
            <p className="mt-2 text-xs text-zinc-500">Main content appears after {(check.pagespeed.metrics.lcpMs / 1000).toFixed(1)} s on a phone.</p>
          )}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className={CARD}>
          <h3 className="mb-2 font-semibold text-zinc-900">What the site can do</h3>
          <ul className="divide-y divide-zinc-100">
            {r.capabilities.map((c) => (
              <li key={c.key} className="flex items-start gap-3 py-2 text-sm">
                <span aria-hidden className={`mt-0.5 font-bold ${c.found ? "text-emerald-600" : "text-red-600"}`}>
                  {c.found ? "✓" : "✗"}
                </span>
                <span>
                  <span className="font-medium text-zinc-900">{c.label}</span>
                  <span className="sr-only">{c.found ? " (yes)" : " (no)"}</span>
                  <span className="block text-zinc-500">{c.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className={CARD}>
          <h3 className="mb-2 font-semibold text-zinc-900">Modules that fit</h3>
          {r.suggestions.length ? (
            <ul className="divide-y divide-zinc-100">
              {r.suggestions.map((s) => (
                <li key={s.moduleId} className="py-2 text-sm">
                  <span className="font-medium text-zinc-900">{moduleNames[s.moduleId] ?? s.moduleId}</span>
                  <span className="block text-zinc-500">{s.reason}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-zinc-500">The site already covers the basics our modules add.</p>
          )}
          <p className="mt-3 text-xs text-zinc-400">These are a starting point; the build plan still comes from the questionnaire.</p>
        </div>
      </div>

      <div className={CARD}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold text-zinc-900">Problems found</h3>
          {canTickForProposal && r.issues.length > 0 && <span className="text-xs text-zinc-500">Tick the ones to show the client on the proposal.</span>}
        </div>
        {r.issues.length ? (
          <ul className="mt-2 divide-y divide-zinc-100">
            {r.issues.map((i) => (
              <li key={i.id} className="flex items-start gap-3 py-2 text-sm">
                {canTickForProposal && (
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4"
                    aria-label={`Show "${i.title}" on the proposal`}
                    checked={check.proposalIssues.includes(i.id)}
                    onChange={(e) => toggleIssue(i.id, e.target.checked)}
                  />
                )}
                <span>
                  <span className="font-medium text-zinc-900">{i.title}</span> <Badge tone={SEV_TONE[i.severity]}>{i.severity}</Badge>
                  <span className="block text-zinc-500">{i.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-zinc-500">No problems found.</p>
        )}
      </div>

      <div className={CARD}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold text-zinc-900">AI review</h3>
          <button type="button" className={BTN} onClick={runAi} disabled={aiBusy}>
            {aiBusy ? "Reviewing…" : check.aiReview ? "Run again" : "Run AI review (~1¢)"}
          </button>
        </div>
        {check.aiReview ? (
          <AiReview review={check.aiReview} />
        ) : (
          <p className="mt-1 text-sm text-zinc-500">Claude reads the site&apos;s text and sums up what the business does, how clear the message is, and what to raise with the owner.</p>
        )}
      </div>
    </>
  );
}

function AiReview({ review: a }: { review: SiteAiReview }) {
  return (
    <div className="mt-3 space-y-3 text-sm text-zinc-700">
      <p>{a.businessSummary}</p>
      {a.services?.length > 0 && (
        <p>
          <strong>Services:</strong> {a.services.join(", ")} · <strong>Industry:</strong> {a.likelyIndustry}
        </p>
      )}
      <p>
        <strong>Message:</strong> {a.messageClarity}
      </p>
      <p>
        <strong>Calls to action:</strong> {a.callsToAction}
      </p>
      {a.weaknesses?.length > 0 && (
        <div>
          <strong>Weak spots</strong>
          <ul className="mt-1 list-disc pl-5">
            {a.weaknesses.map((w) => (
              <li key={w.title}>
                <span className="font-medium">{w.title}:</span> {w.detail}
              </li>
            ))}
          </ul>
        </div>
      )}
      {a.talkingPoints?.length > 0 && (
        <div>
          <strong>Raise with the owner</strong>
          <ul className="mt-1 list-disc pl-5">
            {a.talkingPoints.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
