import { pageSpeedIssues, runPageSpeed, type PageSpeedResult } from "./pagespeed";
import { analyzeSite, interestingLinks, type PageInput, type SiteReport } from "./siteDetect";
import { fetchPage, normalizeSiteUrl, SiteFetchError } from "./siteFetch";

// Runs one website check: the home page, up to 5 useful linked pages on the same
// site, and (when configured) Google PageSpeed in parallel. Server-only.

export const MAX_EXTRA_PAGES = 5;

export async function runSiteCheck(input: string): Promise<{ report: SiteReport; pagespeed: PageSpeedResult | null }> {
  const start = normalizeSiteUrl(input);
  const home = await fetchPage(start); // throws SiteFetchError with a plain-English message
  if (!home.html && home.status < 400) throw new SiteFetchError("That address didn't return a web page");

  const [extra, pagespeed] = await Promise.all([
    Promise.all(
      interestingLinks(home.html, home.finalUrl, MAX_EXTRA_PAGES).map((u) =>
        fetchPage(new URL(u)).catch(() => null), // a broken inner page shouldn't fail the whole check
      ),
    ),
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
