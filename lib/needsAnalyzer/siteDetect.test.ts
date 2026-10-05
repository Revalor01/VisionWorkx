import { describe, expect, it } from "vitest";
import { pageSpeedIssues, parsePageSpeed } from "./pagespeed";
import { analyzeSite, applyPrefill, detectHosting, generatorMeta, interestingLinks, type PageInput } from "./siteDetect";
import { proposalFindings, pickProposalCheck } from "./siteChecks";

const NOW = new Date("2026-09-29T12:00:00Z");
const page = (html: string, over: Partial<PageInput> = {}): PageInput => ({
  url: "https://example.com/",
  finalUrl: "https://example.com/",
  status: 200,
  ms: 800,
  html,
  truncated: false,
  ...over,
});

// A dated Squarespace plumber site: phone number but no tap-to-call, email link only,
// "Book now" wording without a booking tool, no viewport, old copyright.
const WEAK_SITE = `<!doctype html><html><head><title>Harbor</title>
<link href="https://static1.squarespace.com/static/site.css" rel="stylesheet"></head>
<body><h2>Harbor Plumbing</h2><p>Call us: (555) 123-4567</p>
<a href="mailto:hello@harbor.example">Email us</a> <a href="/contact">Contact</a>
<p>Book now for a free estimate!</p><footer>© 2019 Harbor Plumbing</footer></body></html>`;

// A well-equipped WordPress salon site.
const STRONG_SITE = `<!doctype html><html><head><title>Glow Salon | Hair & Beauty in Austin</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="Award-winning hair salon in Austin offering cuts, color and styling since 2012.">
<meta property="og:title" content="Glow Salon">
<script src="https://www.googletagmanager.com/gtag/js?id=G-ABC123"></script>
<link rel="stylesheet" href="/wp-content/themes/glow/style.css"></head>
<body><h1>Glow Salon</h1><a href="tel:+15551234567">Call</a>
<a href="https://glow.vagaro.com/book">Book online</a>
<form class="wpcf7-form" action="/contact"><input name="your-name"><input type="email" name="your-email"><textarea name="your-message"></textarea></form>
<div class="elfsight-app-reviews"></div>
<form action="https://glow.us1.list-manage.com/subscribe"><input type="email" name="EMAIL"></form>
<a href="/pricing">Pricing</a> <a href="https://www.instagram.com/glowsalon">Instagram</a>
<footer>© 2026 Glow Salon</footer></body></html>`;

describe("analyzeSite", () => {
  it("finds the gaps on a weak site and suggests the matching modules", () => {
    const r = analyzeSite("harbor.example", [page(WEAK_SITE, { finalUrl: "http://harbor.example/", ms: 4200 })], NOW);
    expect(r.platform).toBe("Squarespace");
    const cap = Object.fromEntries(r.capabilities.map((c) => [c.key, c]));
    expect(cap.leadForm.found).toBe(false);
    expect(cap.leadForm.detail).toMatch(/email link/i);
    expect(cap.booking.found).toBe(false);
    expect(cap.clickToCall.detail).toMatch(/not tappable/);
    const ids = r.issues.map((i) => i.id);
    for (const id of ["no-https", "not-mobile", "no-lead-form", "slow", "no-tap-to-call", "book-no-tool", "no-title", "no-description", "no-h1", "stale", "no-analytics"])
      expect(ids).toContain(id);
    expect(r.issues[0].severity).toBe("high"); // sorted most serious first
    const mods = r.suggestions.map((s) => s.moduleId);
    for (const m of ["vw-lead", "vw-booking", "vw-quote", "auto-reviews", "svc-site"]) expect(mods).toContain(m);
    expect(r.prefill).toMatchObject({ website: "harbor.example", sitePlatform: "Squarespace", givesQuotes: "Yes" });
    expect(r.prefill.leadSources).toBeUndefined();
    expect(String(r.prefill.siteObservations)).toMatch(/^Website check: /);
  });

  it("recognises a well-equipped site", () => {
    const r = analyzeSite("glow.example", [page(STRONG_SITE)], NOW);
    expect(r.platform).toBe("WordPress");
    expect(r.capabilities.every((c) => c.key === "chat" || c.found)).toBe(true);
    expect(r.tools).toEqual(expect.arrayContaining(["Contact Form 7", "Vagaro", "Elfsight reviews", "Mailchimp", "Google Analytics"]));
    expect(r.issues.filter((i) => i.severity !== "low")).toEqual([]);
    const mods = r.suggestions.map((s) => s.moduleId);
    expect(mods).not.toContain("vw-lead");
    expect(mods).not.toContain("vw-booking");
    expect(mods).not.toContain("svc-site");
    expect(r.prefill).toMatchObject({ sitePlatform: "WordPress", leadSources: ["Website form"], takesAppointments: "Yes", bookingMethod: "Online booking tool" });
    expect(r.prefill.currentTools).toEqual(expect.arrayContaining(["Mailchimp", "Facebook / Instagram"]));
  });

  it("doesn't count a search box or an email-only signup as a lead form", () => {
    const html = `<meta name="viewport" content="x"><form role="search"><input name="q"></form><form><input type="email" name="email"></form>`;
    const r = analyzeSite("x.example", [page(html)], NOW);
    expect(r.capabilities.find((c) => c.key === "leadForm")?.found).toBe(false);
  });

  it("flags a form that posts over plain http", () => {
    const html = `<form action="http://forms.example/post"><input name="name"><input type="email" name="email"></form>`;
    expect(analyzeSite("x.example", [page(html)], NOW).issues.map((i) => i.id)).toContain("insecure-form");
  });
});

describe("interestingLinks", () => {
  it("keeps same-site contact/booking/pricing pages, drops the rest", () => {
    const html = `<a href="/contact-us">Contact</a><a href="/pricing">Prices</a><a href="https://other.example/book">Book</a>
      <a href="/blog/post">Blog</a><a href="/files/menu.pdf">Services PDF</a><a href="/contact-us#form">Contact again</a><a href="/about">About us</a>`;
    expect(interestingLinks(html, "https://example.com/")).toEqual(["https://example.com/contact-us", "https://example.com/pricing", "https://example.com/about"]);
  });
});

describe("platform detection", () => {
  it("fingerprints newer builders / CMSes", () => {
    const drupal = `<html><head><meta name="generator" content="Drupal 10 (https://www.drupal.org)"></head><body>hi</body></html>`;
    expect(analyzeSite("x", [page(drupal)]).platform).toBe("Drupal");
    const hubspot = `<html><body><script src="https://js.hs-scripts.com/123.js"></script></body></html>`;
    expect(analyzeSite("x", [page(hubspot)]).platform).toBe("HubSpot CMS");
    const weebly = `<html><body><link href="https://cdn2.editmysite.com/x.css"></body></html>`;
    expect(analyzeSite("x", [page(weebly)]).platform).toBe("Weebly");
  });

  it("falls back to the <meta generator> value when no known platform matches", () => {
    const html = `<html><head><meta name="generator" content="ProphetCMS 4.2"></head><body>hi</body></html>`;
    expect(analyzeSite("x", [page(html)]).platform).toBe("ProphetCMS 4.2");
  });

  it("generatorMeta reads the value regardless of attribute order, strips a trailing URL, caps length, null when absent", () => {
    expect(generatorMeta(`<meta content="Joomla! - Open Source CMS (https://joomla.org)" name="generator">`)).toBe("Joomla! - Open Source CMS");
    expect(generatorMeta(`<html><body>no meta</body></html>`)).toBeNull();
    expect(generatorMeta(`<meta name="generator" content="${"A".repeat(100)}">`)).toHaveLength(60);
  });

  it("is null for a hand-coded site with no markers", () => {
    expect(analyzeSite("x", [page(`<html><body><h1>Hand coded</h1></body></html>`)]).platform).toBeNull();
  });
});

describe("detectHosting", () => {
  it("names the CDN/edge from infra response headers", () => {
    expect(detectHosting({ "cf-ray": "abc123" })).toBe("Cloudflare");
    expect(detectHosting({ "x-vercel-id": "iad1::abc" })).toBe("Vercel");
    expect(detectHosting({ "x-nf-request-id": "abc" })).toBe("Netlify");
    expect(detectHosting({ "x-amz-cf-id": "abc" })).toBe("AWS CloudFront");
    expect(detectHosting({ "x-github-request-id": "abc" })).toBe("GitHub Pages");
  });

  it("falls back to the web server, and is null when nothing is recognisable", () => {
    expect(detectHosting({ server: "nginx/1.25.3" })).toBe("Nginx");
    expect(detectHosting({ server: "Apache" })).toBe("Apache");
    expect(detectHosting({})).toBeNull();
    expect(detectHosting({ server: "SomethingWeird/9" })).toBeNull();
  });

  it("surfaces on the report from the home page's headers", () => {
    const r = analyzeSite("x", [page("<html><body>hi</body></html>", { headers: { "cf-ray": "1" } })]);
    expect(r.hosting).toBe("Cloudflare");
  });
});

describe("applyPrefill", () => {
  it("only fills answers that are empty", () => {
    const out = applyPrefill({ website: "mine.example", leadSources: [], sitePlatform: "" }, { website: "x.example", leadSources: ["Website form"], sitePlatform: "Wix" });
    expect(out).toEqual({ website: "mine.example", leadSources: ["Website form"], sitePlatform: "Wix" });
  });
});

describe("proposal findings", () => {
  const r = analyzeSite("harbor.example", [page(WEAK_SITE, { finalUrl: "https://www.harbor.example/" })], NOW);
  const check = (proposalIssues: string[]) => ({ report: r, proposalIssues, finalUrl: r.finalUrl, url: r.inputUrl });

  it("shows only ticked issues, with client-safe text", () => {
    const f = proposalFindings(check(["not-mobile", "no-lead-form", "made-up"]));
    expect(f?.site).toBe("harbor.example");
    expect(f?.items.map((i) => i.title)).toEqual(["Not set up for phones", "No way to send an enquiry online"]);
    expect(JSON.stringify(f)).not.toMatch(/textExcerpt|suggestions|severity/);
  });

  it("shows nothing when nothing is ticked, and uses the newest check with ticks", () => {
    expect(proposalFindings(check([]))).toBeNull();
    expect(pickProposalCheck([{ id: "new", proposalIssues: [] }, { id: "old", proposalIssues: ["x"] }])?.id).toBe("old");
  });
});

describe("pagespeed", () => {
  it("parses scores and turns low ones into issues", () => {
    const p = parsePageSpeed({
      lighthouseResult: {
        categories: { performance: { score: 0.34 }, seo: { score: 0.7 }, accessibility: { score: 0.95 }, "best-practices": { score: 0.9 } },
        audits: { "largest-contentful-paint": { numericValue: 5400 } },
      },
    })!;
    expect(p.scores).toEqual({ performance: 34, seo: 70, accessibility: 95, bestPractices: 90 });
    expect(p.metrics.lcpMs).toBe(5400);
    expect(pageSpeedIssues(p).map((i) => [i.id, i.severity])).toEqual([
      ["ps-performance", "high"],
      ["ps-seo", "medium"],
    ]);
  });
});
