"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { fmtDate } from "@/lib/needsAnalyzer/format";
import { applyPrefill } from "@/lib/needsAnalyzer/siteDetect";
import type { SiteCheck } from "@/lib/needsAnalyzer/siteChecks";
import type { Answers } from "@/lib/needsAnalyzer/types";
import { SiteReportView } from "./SiteReportView";
import { api, BTN, BTN_PRIMARY, CARD, INPUT, NaShell, useClientMode, useToast } from "./ui";

interface Props {
  recent: { id: string; url: string; assessmentId: string | null; createdAt: string }[];
  initialCheck: SiteCheck | null;
  assessment: { id: string; bizName: string; answers: Answers } | null;
  initialUrl: string;
  autorun: boolean;
  moduleNames: Record<string, string>;
  pageSpeedOn: boolean;
}

export default function WebsiteCheck(props: Props) {
  return (
    <NaShell active="website">
      {/* Remount when a different check is opened from Recent checks. */}
      <Body key={props.initialCheck?.id ?? "new"} {...props} />
    </NaShell>
  );
}

function Body({ recent, initialCheck, assessment, initialUrl, autorun, moduleNames, pageSpeedOn }: Props) {
  const router = useRouter();
  const toast = useToast();
  const { on: clientMode } = useClientMode();
  const [url, setUrl] = useState(initialCheck?.report.inputUrl ?? initialUrl);
  const [check, setCheck] = useState<SiteCheck | null>(initialCheck);
  const [busy, setBusy] = useState(false);
  const [applying, setApplying] = useState(false);
  const ran = useRef(false);

  async function run(target = url) {
    if (!target.trim()) {
      toast("Enter a website address");
      return;
    }
    setBusy(true);
    try {
      const c = await api<SiteCheck>("POST", "/api/admin/needs-analyzer/site-check", { url: target, assessmentId: assessment?.id });
      setCheck(c);
      const q = new URLSearchParams({ check: c.id });
      if (assessment) q.set("assessment", assessment.id);
      window.history.replaceState(null, "", `?${q}`);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // "Check website" from an assessment opens this page with ?run=1: check straight away, once.
  useEffect(() => {
    if (autorun && !initialCheck && initialUrl && !ran.current) {
      ran.current = true;
      void run(initialUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on arrival
  }, []);

  async function startAssessment() {
    if (!check) return;
    setApplying(true);
    try {
      const { id } = await api<{ id: string }>("POST", "/api/admin/needs-analyzer/assessments", { answers: check.report.prefill });
      await api("PATCH", `/api/admin/needs-analyzer/site-check/${check.id}`, { assessmentId: id });
      router.push(`/admin/needs-analyzer/${id}?tab=q`);
    } catch (e) {
      toast((e as Error).message);
      setApplying(false);
    }
  }

  async function applyToAssessment() {
    if (!check || !assessment) return;
    setApplying(true);
    try {
      // Only empty answers are filled, so nothing already entered is overwritten.
      await api("PUT", `/api/admin/needs-analyzer/assessments/${assessment.id}`, { answers: applyPrefill(assessment.answers, check.report.prefill) });
      if (check.assessmentId !== assessment.id) await api("PATCH", `/api/admin/needs-analyzer/site-check/${check.id}`, { assessmentId: assessment.id });
      router.push(`/admin/needs-analyzer/${assessment.id}?tab=q`);
    } catch (e) {
      toast((e as Error).message);
      setApplying(false);
    }
  }

  if (clientMode) return <div className={`${CARD} text-zinc-500`}>The website check is hidden in Client mode.</div>;

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_300px]">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">Website check</h1>
        <p className="mb-4 text-sm text-zinc-500">
          Enter a business&apos;s website. Revalor reads it and reports what it can do, what&apos;s wrong, and which modules fit.
          {!pageSpeedOn && " (Google PageSpeed scores are off until GOOGLE_PAGESPEED_API_KEY is set.)"}
        </p>
        {assessment && (
          <div className="mb-4 rounded-lg border border-teal-200 bg-teal-50 px-4 py-2 text-sm text-teal-900">
            For the assessment <strong>{assessment.bizName}</strong>.{" "}
            <Link href={`/admin/needs-analyzer/${assessment.id}`} className="underline">
              Back to it
            </Link>
          </div>
        )}
        <form
          className={`${CARD} flex flex-wrap gap-2`}
          onSubmit={(e) => {
            e.preventDefault();
            void run();
          }}
        >
          <input className={`${INPUT} min-w-[240px] flex-1`} placeholder="example.com" value={url} onChange={(e) => setUrl(e.target.value)} aria-label="Website address" />
          <button type="submit" className={BTN_PRIMARY} disabled={busy}>
            {busy ? "Checking… (up to a minute)" : "Check website"}
          </button>
        </form>

        {check && (
          <>
            <div className={`${CARD} flex flex-wrap items-center justify-between gap-3`}>
              <p className="text-sm text-zinc-600">
                {assessment
                  ? `Fill in ${assessment.bizName}'s empty questionnaire answers from this check (platform, forms, booking, website notes).`
                  : check.assessmentId
                    ? "This check belongs to an assessment."
                    : "Start an assessment with the questionnaire already filled in from this check."}
              </p>
              {assessment ? (
                <button type="button" className={BTN_PRIMARY} onClick={applyToAssessment} disabled={applying}>
                  {applying ? "Applying…" : "Apply to assessment"}
                </button>
              ) : check.assessmentId ? (
                <Link className={BTN} href={`/admin/needs-analyzer/${check.assessmentId}`}>
                  Open assessment →
                </Link>
              ) : (
                <button type="button" className={BTN_PRIMARY} onClick={startAssessment} disabled={applying}>
                  {applying ? "Starting…" : "Start assessment from this"}
                </button>
              )}
            </div>
            <SiteReportView
              check={check}
              setCheck={setCheck}
              moduleNames={moduleNames}
              canTickForProposal={!!(assessment || check.assessmentId)}
            />
          </>
        )}
      </div>

      <aside className={`${CARD} h-fit`}>
        <h3 className="mb-2 font-semibold text-zinc-900">Recent checks</h3>
        {recent.length ? (
          <ul className="space-y-1 text-sm">
            {recent.map((r) => (
              <li key={r.id}>
                <Link href={`/admin/needs-analyzer/website?check=${r.id}`} className={`block truncate hover:underline ${check?.id === r.id ? "font-semibold text-teal-700" : "text-zinc-700"}`}>
                  {r.url.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                </Link>
                <span className="text-xs text-zinc-400">{fmtDate(r.createdAt)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-zinc-500">None yet.</p>
        )}
      </aside>
    </div>
  );
}
