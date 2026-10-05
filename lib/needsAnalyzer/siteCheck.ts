import { pageSpeedIssues, runPageSpeed, type PageSpeedResult } from "./pagespeed";
import { analyzeSite, pagesToCrawl, type PageInput, type SiteReport } from "./siteDetect";
import { fetchPage, normalizeSiteUrl, SiteFetchError, type FetchedPage } from "./siteFetch";

// Runs one website check: the home page, the site's nav "tabs" plus other useful
// linked pages on the same site (up to MAX_EXTRA_PAGES), and (when configured)
// Google PageSpeed in parallel. Server-only.

// Default 12; NEEDS_ANALYZER_MAX_PAGES can tune it, hard-capped at 20 so a
// misconfig can't make the check crawl an unbounded number of pages.
export const MAX_EXTRA_PAGES = Math.min(20, Math.max(1, Number(process.env.NEEDS_ANALYZER_MAX_PAGES) || 12));
// Fetch the extra pages a few at a time rather than all at once — kinder to the
// target site and keeps peak memory/sockets bounded, while staying well inside
// the route's 60s budget (each page is capped at 8s).
const FETCH_CONCURRENCY = 6;

async function fetchInBatches(urls: URL[], size: number): Promise<(FetchedPage | null)[]> {
  const results: (FetchedPage | null)[] = [];
  for (let i = 0; i < urls.length; i += size) {
    const batch = urls.slice(i, i + size);
    // A broken inner page shouldn't fail the whole check.
    results.push(...(await Promise.all(batch.map((u) => fetchPage(u).catch(() => null)))));
  }
  return results;
}

export async function runSiteCheck(input: string): Promise<{ report: SiteReport; pagespeed: PageSpeedResult | null }> {
  const start = normalizeSiteUrl(input);
  const home = await fetchPage(start); // throws SiteFetchError with a plain-English message
  if (!home.html && home.status < 400) throw new SiteFetchError("That address didn't return a web page");

  const extraUrls = pagesToCrawl(home.html, home.finalUrl, MAX_EXTRA_PAGES).map((u) => new URL(u));
  const [extra, pagespeed] = await Promise.all([
    fetchInBatches(extraUrls, FETCH_CONCURRENCY),
    runPageSpeed(home.finalUrl),
  ]);

  const pages: PageInput[] = [home, ...extra.filter((p): p is NonNullable<typeof p> => !!p && p.status < 400 && !!p.html)];
  const report = analyzeSite(start.href, pages);
  if (pagespeed) {
    report.issues.push(...pageSpeedIssues(pagespeed));
    const order = { high: 0, medium: 1, low: 2 };
    report.issues.sort((a, b) => order[a.severity] - order[b.severity]);
  }
  return { report, pagespeed };
}
