import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isOperator } from "@/lib/modules/adminGuard";
import { getAssessment, loadSettings, naDb, UUID_RE } from "@/lib/needsAnalyzer/db";
import { pageSpeedEnabled } from "@/lib/needsAnalyzer/pagespeed";
import { SITE_CHECK_COLUMNS, toSiteCheck, type SiteCheckRow } from "@/lib/needsAnalyzer/siteChecks";
import WebsiteCheck from "../WebsiteCheck";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Website check · Needs Analyzer", robots: { index: false, follow: false } };

// Website check: enter a business's site, see what it can do, what's wrong, which
// modules fit; start an assessment from it or apply it to one (?assessment=<id>).
export default async function WebsiteCheckPage({
  searchParams,
}: {
  searchParams: Promise<{ check?: string; assessment?: string; url?: string; run?: string }>;
}) {
  if (!(await isOperator())) redirect("/dashboard");
  const sp = await searchParams;
  const db = naDb();
  const [recentRes, selectedRes, assessment, { catalog }] = await Promise.all([
    db.from("vw_na_site_checks").select("id, url, final_url, assessment_id, created_at").eq("is_test", false).order("created_at", { ascending: false }).limit(25),
    sp.check && UUID_RE.test(sp.check) ? db.from("vw_na_site_checks").select(SITE_CHECK_COLUMNS).eq("id", sp.check).maybeSingle() : Promise.resolve({ data: null }),
    sp.assessment ? getAssessment(db, sp.assessment) : Promise.resolve(null),
    loadSettings(db),
  ]);

  return (
    <WebsiteCheck
      recent={(recentRes.data ?? []).map((r) => ({ id: r.id, url: r.final_url || r.url, assessmentId: r.assessment_id, createdAt: r.created_at }))}
      initialCheck={selectedRes.data ? toSiteCheck(selectedRes.data as SiteCheckRow) : null}
      assessment={assessment ? { id: assessment.id, bizName: String(assessment.answers.bizName || "") || "Untitled business", answers: assessment.answers } : null}
      initialUrl={sp.url ?? (assessment ? String(assessment.answers.website || "") : "")}
      autorun={sp.run === "1"}
      moduleNames={Object.fromEntries(catalog.modules.map((m) => [m.id, m.name]))}
      pageSpeedOn={pageSpeedEnabled()}
    />
  );
}
