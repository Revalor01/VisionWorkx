import type { SiteIssue } from "./siteDetect";

// Google PageSpeed Insights (mobile) for the website check. Optional: skipped
// unless GOOGLE_PAGESPEED_API_KEY is set (free key from Google Cloud). Google
// fetches the site from its own servers, so this adds no SSRF surface here.

export interface PageSpeedResult {
  strategy: "mobile";
  scores: { performance: number | null; accessibility: number | null; seo: number | null; bestPractices: number | null };
  metrics: { lcpMs: number | null; cls: number | null; tbtMs: number | null };
}

const API = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";

export const pageSpeedEnabled = () => !!process.env.GOOGLE_PAGESPEED_API_KEY;

export async function runPageSpeed(url: string): Promise<PageSpeedResult | null> {
  const key = process.env.GOOGLE_PAGESPEED_API_KEY;
  if (!key) return null;
  const q = new URLSearchParams({ url, strategy: "mobile", key });
  for (const c of ["performance", "accessibility", "seo", "best-practices"]) q.append("category", c);
  try {
    const res = await fetch(`${API}?${q}`, { signal: AbortSignal.timeout(50_000) });
    if (!res.ok) {
      console.warn("[pagespeed] HTTP", res.status);
      return null;
    }
    return parsePageSpeed(await res.json());
  } catch (e) {
    console.warn("[pagespeed] failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

type Lh = { categories?: Record<string, { score?: number | null }>; audits?: Record<string, { numericValue?: number }> };

export function parsePageSpeed(json: { lighthouseResult?: Lh }): PageSpeedResult | null {
  const lh = json?.lighthouseResult;
  if (!lh?.categories) return null;
  const score = (k: string) => {
    const s = lh.categories?.[k]?.score;
    return typeof s === "number" ? Math.round(s * 100) : null;
  };
  const num = (k: string) => {
    const v = lh.audits?.[k]?.numericValue;
    return typeof v === "number" ? v : null;
  };
  return {
    strategy: "mobile",
    scores: { performance: score("performance"), accessibility: score("accessibility"), seo: score("seo"), bestPractices: score("best-practices") },
    metrics: { lcpMs: num("largest-contentful-paint"), cls: num("cumulative-layout-shift"), tbtMs: num("total-blocking-time") },
  };
}

/** Extra issues from the PageSpeed scores. */
export function pageSpeedIssues(p: PageSpeedResult): SiteIssue[] {
  const out: SiteIssue[] = [];
  const perf = p.scores.performance;
  if (perf !== null && perf < 50)
    out.push({ id: "ps-performance", severity: "high", title: `Slow on phones (Google score ${perf}/100)`, detail: "Google's own test rates the site slow on a phone, which costs visitors and search ranking." });
  else if (perf !== null && perf < 80)
    out.push({ id: "ps-performance", severity: "medium", title: `Could be faster on phones (Google score ${perf}/100)`, detail: "Google's test shows room to make the site load faster on phones." });
  if (p.scores.seo !== null && p.scores.seo < 80)
    out.push({ id: "ps-seo", severity: "medium", title: `Search basics missing (Google SEO score ${p.scores.seo}/100)`, detail: "Google's test found basic search-engine setup missing, which makes the business harder to find." });
  if (p.scores.accessibility !== null && p.scores.accessibility < 80)
    out.push({ id: "ps-accessibility", severity: "low", title: `Hard to use for some visitors (accessibility ${p.scores.accessibility}/100)`, detail: "Some visitors, such as those with poor eyesight, will find parts of the site hard to use." });
  return out;
}
