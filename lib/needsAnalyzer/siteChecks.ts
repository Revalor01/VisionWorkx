import type { PageSpeedResult } from "./pagespeed";
import type { SiteReport } from "./siteDetect";
import type { SiteAiReview } from "./siteReview";

// Saved website checks (vw_na_site_checks) as the screens and the proposal use
// them. No server-only imports, so client components can use this file.

/** A saved check as the screens use it. */
export interface SiteCheck {
  id: string;
  url: string;
  finalUrl: string | null;
  assessmentId: string | null;
  report: SiteReport;
  pagespeed: PageSpeedResult | null;
  aiReview: SiteAiReview | null;
  proposalIssues: string[];
  createdAt: string;
}

export const SITE_CHECK_COLUMNS = "id, url, final_url, assessment_id, report, pagespeed, ai_review, proposal_issues, created_at";

export interface SiteCheckRow {
  id: string;
  url: string;
  final_url: string | null;
  assessment_id: string | null;
  report: SiteReport;
  pagespeed: PageSpeedResult | null;
  ai_review: SiteAiReview | null;
  proposal_issues: string[] | null;
  created_at: string;
}

export function toSiteCheck(r: SiteCheckRow): SiteCheck {
  return {
    id: r.id,
    url: r.url,
    finalUrl: r.final_url,
    assessmentId: r.assessment_id,
    report: r.report,
    pagespeed: r.pagespeed,
    aiReview: r.ai_review,
    proposalIssues: r.proposal_issues ?? [],
    createdAt: r.created_at,
  };
}

/** What the client proposal shows: only the issues the operator ticked. No internal fields. */
export function proposalFindings(check: Pick<SiteCheck, "report" | "proposalIssues" | "finalUrl" | "url"> | null) {
  if (!check?.proposalIssues.length) return null;
  const items = check.report.issues.filter((i) => check.proposalIssues.includes(i.id)).map((i) => ({ title: i.title, detail: i.detail }));
  return items.length ? { site: new URL(check.finalUrl || check.url).hostname.replace(/^www\./, ""), items } : null;
}

/** The check whose ticked issues go on the proposal: the newest one that has any ticked. */
export function pickProposalCheck<T extends Pick<SiteCheck, "proposalIssues">>(checks: T[]): T | null {
  return checks.find((c) => c.proposalIssues.length > 0) ?? null;
}
