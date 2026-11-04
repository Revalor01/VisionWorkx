import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ApparelProposal } from "@/app/admin/needs-analyzer/ApparelProposal";
import { Proposal } from "@/app/admin/needs-analyzer/Proposal";
import { loadSettings, naDb, SHARE_TOKEN_RE } from "@/lib/needsAnalyzer/db";
import { assessmentPath } from "@/lib/needsAnalyzer/questions";
import { computeApparelPlan, computePlan } from "@/lib/needsAnalyzer/rules";
import { pickProposalCheck, proposalFindings, SITE_CHECK_COLUMNS, type SiteCheckRow, toSiteCheck } from "@/lib/needsAnalyzer/siteChecks";
import type { Answers, Overrides } from "@/lib/needsAnalyzer/types";
import PrintButton from "./PrintButton";

// Public client proposal link, made from /admin/needs-analyzer/<id> → Proposal →
// Client link. Works only while sharing is on for that assessment (turning it off,
// making a new link, or deleting the assessment stops it). Shows the proposal
// component only -- never internal notes, scores, effort or margin.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your build plan", robots: { index: false, follow: false } };

export default async function SharedProposalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!SHARE_TOKEN_RE.test(token)) notFound();
  const db = naDb();
  const { data } = await db
    .from("vw_na_assessments")
    .select("id, answers, overrides, updated_at")
    .eq("share_token", token)
    .eq("share_enabled", true)
    .is("deleted_at", null)
    .maybeSingle();
  if (!data) notFound();
  const [{ catalog, ecosystem }, { data: checkRows }] = await Promise.all([
    loadSettings(db),
    // Website-check issues the operator ticked for the proposal (newest check with any ticked).
    db
      .from("vw_na_site_checks")
      .select(SITE_CHECK_COLUMNS)
      .eq("assessment_id", data.id)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);
  const siteFindings = proposalFindings(pickProposalCheck(((checkRows ?? []) as SiteCheckRow[]).map(toSiteCheck)));
  const assessment = { answers: (data.answers ?? {}) as Answers, overrides: (data.overrides ?? {}) as Overrides };
  const path = assessmentPath(assessment.answers);
  const plan = computePlan(assessment, catalog, ecosystem);

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-8 print:bg-white print:p-0">
      <div className="mx-auto mb-4 flex max-w-[850px] justify-end print:hidden">
        <PrintButton />
      </div>
      {path === "apparel" ? (
        <ApparelProposal answers={assessment.answers} plan={computeApparelPlan(assessment.answers, catalog)} catalog={catalog} prepared={data.updated_at} />
      ) : (
        <Proposal answers={assessment.answers} plan={plan} catalog={catalog} prepared={data.updated_at} siteFindings={siteFindings} websiteBuild={assessment.overrides.websiteBuild} monthlyDiscountPct={assessment.overrides.monthlyDiscountPct} />
      )}
    </main>
  );
}
