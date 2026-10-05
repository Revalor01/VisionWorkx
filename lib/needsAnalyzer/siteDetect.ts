import type { Answers } from "./types";

// Website check: reads the HTML of a business's home page (plus a few linked pages)
// and reports what the site can do, what's wrong with it, which Revalor modules fit,
// and which questionnaire answers it can fill in. Pure (no network) so it's tested
// against sample pages in siteDetect.test.ts. Detection is pattern matching on the
// page source: consistent and free, but it only sees what's in the HTML (anything a
// site builds purely in the browser after load can be missed).

export interface PageInput {
  url: string;
  finalUrl: string;
  status: number;
  ms: number;
  html: string;
  truncated: boolean;
}

export type Severity = "high" | "medium" | "low";

export interface Capability {
  key: CapabilityKey;
  label: string;
  found: boolean;
  detail: string;
}
export type CapabilityKey = "leadForm" | "booking" | "quote" | "reviews" | "chat" | "emailSignup" | "analytics" | "clickToCall" | "social";

export interface SiteIssue {
  id: string;
  severity: Severity;
  title: string;
  /** Plain-English, client-safe explanation (used on the proposal when ticked). */
  detail: string;
}

export interface ModuleSuggestion {
  moduleId: string;
  reason: string;
}

export interface SiteReport {
  inputUrl: string;
  finalUrl: string;
  checkedAt: string;
  pages: { url: string; status: number; ms: number }[];
  platform: string | null;
  tools: string[];
  capabilities: Capability[];
  issues: SiteIssue[];
  suggestions: ModuleSuggestion[];
  prefill: Answers;
  /** Visible text from the pages, for the optional AI review. Never shown to clients. */
  textExcerpt: string;
}

// ---------- signal tables ----------

type Sig = [name: string, re: RegExp];

const PLATFORMS: [option: string, re: RegExp][] = [
  ["WordPress", /wp-content\/|wp-includes\/|<meta[^>]+generator[^>]+wordpress/i],
  ["Squarespace", /static1\.squarespace\.com|squarespace-cdn\.com|<meta[^>]+generator[^>]+squarespace/i],
  ["Wix", /static\.wixstatic\.com|parastorage\.com|<meta[^>]+generator[^>]+wix\.com/i],
  ["Webflow", /data-wf-page=|assets\.website-files\.com|webflow\.js|<meta[^>]+generator[^>]+webflow/i],
  ["Shopify", /cdn\.shopify\.com|shopify\.theme|myshopify\.com/i],
  ["GoDaddy builder", /img1\.wsimg\.com|<meta[^>]+generator[^>]+(godaddy|starfield)/i],
  ["Framer", /framerusercontent\.com|<meta[^>]+generator[^>]+framer/i],
];

const FORM_EMBEDS: Sig[] = [
  ["Typeform", /typeform\.com/i],
  ["JotForm", /jotform\.(com|us)|jotfor\.ms/i],
  ["HubSpot form", /js\.hsforms\.net|forms\.hubspot\.com|hbspt\.forms/i],
  ["Google Form", /docs\.google\.com\/forms/i],
  ["Formstack", /formstack\.com/i],
  ["Cognito Forms", /cognitoforms\.com/i],
  ["Wufoo", /wufoo\.com/i],
  ["Gravity Forms", /gform_wrapper|gravityforms/i],
  ["WPForms", /wpforms-form|wpforms\//i],
  ["Contact Form 7", /wpcf7/i],
  ["Squarespace form", /sqs-block-form|form-block/i],
  ["Wix form", /wixforms|wix-forms/i],
  ["Jobber request form", /clienthub\.getjobber\.com|getjobber\.com\/.*request/i],
];

const BOOKING: Sig[] = [
  ["Calendly", /calendly\.com/i],
  ["Acuity Scheduling", /acuityscheduling\.com|as\.me\//i],
  ["Square Appointments", /squareup\.com\/appointments|book\.squareup\.com|app\.squareup\.com\/appointments/i],
  ["Setmore", /setmore\.com/i],
  ["Vagaro", /vagaro\.com/i],
  ["Booksy", /booksy\.com/i],
  ["Mindbody", /mindbodyonline\.com|healcode\.com|brandedweb\.mindbodyonline/i],
  ["Schedulicity", /schedulicity\.com/i],
  ["SimplyBook.me", /simplybook\.(me|it)/i],
  ["Housecall Pro", /housecallpro\.com/i],
  ["Jobber", /getjobber\.com/i],
  ["ServiceTitan", /servicetitan\.com/i],
  ["Zocdoc", /zocdoc\.com/i],
  ["OpenTable", /opentable\.com/i],
  ["Resy", /resy\.com/i],
  ["GlossGenius", /glossgenius\.com/i],
  ["Fresha", /fresha\.com/i],
  ["Booker", /booker\.com/i],
  ["Square Online booking", /square\.site\/book/i],
  ["Google Calendar booking", /calendar\.google\.com\/calendar\/appointments|calendar\.app\.google/i],
];

const REVIEWS: Sig[] = [
  ["Elfsight reviews", /elfsight/i],
  ["Trustindex", /trustindex\.io/i],
  ["Birdeye", /birdeye\.com/i],
  ["Podium", /podium\.com/i],
  ["Trustpilot", /trustpilot\.com/i],
  ["Reviews.io", /reviews\.io|reviews\.co\.uk/i],
  ["Yotpo", /yotpo\.com/i],
  ["Judge.me", /judge\.me/i],
  ["Google reviews widget", /google-reviews|grw-|g-review|reviewsonmywebsite/i],
  ["Yelp widget", /yelp\.com\/(biz|embed)/i],
];

const CHAT: Sig[] = [
  ["Intercom", /widget\.intercom\.io|intercomcdn/i],
  ["Drift", /js\.driftt\.com|drift\.com/i],
  ["Tidio", /tidio\.co|tidiochat/i],
  ["tawk.to", /tawk\.to/i],
  ["Crisp", /client\.crisp\.chat/i],
  ["LiveChat", /livechatinc\.com/i],
  ["Zendesk chat", /zopim|zdassets\.com/i],
  ["HubSpot chat", /js\.usemessages\.com/i],
  ["Podium webchat", /connect\.podium\.com/i],
  ["Facebook Messenger", /customerchat|xfbml\.customerchat/i],
];

const EMAIL: Sig[] = [
  ["Mailchimp", /list-manage\.com|chimpstatic\.com|mc4wp/i],
  ["Klaviyo", /klaviyo\.com/i],
  ["Constant Contact", /ctctcdn\.com|constantcontact\.com/i],
  ["ConvertKit", /convertkit\.com|ck\.page/i],
  ["MailerLite", /mailerlite\.com/i],
  ["beehiiv", /beehiiv\.com/i],
  ["Flodesk", /flodesk\.com/i],
];

const ANALYTICS: Sig[] = [
  ["Google Analytics", /googletagmanager\.com\/gtag\/js|google-analytics\.com|gtag\(\s*['"]config['"]/i],
  ["Google Tag Manager", /googletagmanager\.com\/gtm\.js|GTM-[A-Z0-9]{4,}/],
  ["Meta pixel", /connect\.facebook\.net\/[^"']*fbevents\.js|fbq\(\s*['"]init/i],
  ["Hotjar", /static\.hotjar\.com/i],
  ["Microsoft Clarity", /clarity\.ms/i],
  ["Plausible", /plausible\.io/i],
];

const SOCIAL: Sig[] = [
  ["Facebook", /href=["'][^"']*facebook\.com\/(?!sharer|tr\?|plugins)[^"']+/i],
  ["Instagram", /href=["'][^"']*instagram\.com\/[^"']+/i],
  ["LinkedIn", /href=["'][^"']*linkedin\.com\/(company|in)\/[^"']+/i],
  ["Google Business Profile", /href=["'][^"']*(g\.page|maps\.app\.goo\.gl|google\.com\/maps|business\.google\.com)[^"']*/i],
];

// questionnaire currentTools options that the site can reveal
const TOOL_OPTIONS: [option: string, re: RegExp][] = [
  ["Calendly", /calendly\.com/i],
  ["Mailchimp", /list-manage\.com|chimpstatic\.com|mc4wp/i],
  ["HubSpot", /hsforms|hubspot|usemessages\.com|hs-scripts\.com/i],
  ["Square", /squareup\.com|square\.site/i],
  ["Stripe", /js\.stripe\.com|buy\.stripe\.com/i],
  ["Facebook / Instagram", /facebook\.com\/|instagram\.com\//i],
];

const found = (sigs: Sig[], s: string) => sigs.filter(([, re]) => re.test(s)).map(([n]) => n);

// ---------- html helpers ----------

export function visibleText(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

const attr = (tag: string, name: string) => new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, "i").exec(tag)?.[2] ?? null;

/** Real lead forms: a <form> with an email or phone field that isn't a search or newsletter-only box. */
function leadForms(html: string): { count: number; insecureAction: boolean } {
  let count = 0;
  let insecureAction = false;
  for (const m of html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)) {
    const [, open, body] = m;
    if (/role=["']search|search/i.test(open) || /name=["'](s|q|search)["']/i.test(body)) continue;
    const inputs = body.match(/<(input|textarea|select)\b[^>]*>/gi) || [];
    const hasContact = inputs.some((i) => /type=["'](email|tel)["']|name=["'][^"']*(email|phone|tel)[^"']*["']/i.test(i));
    const hasMessageOrName = inputs.some((i) => /<textarea|name=["'][^"']*(name|message|comment|details)[^"']*["']/i.test(i));
    if (!hasContact || !hasMessageOrName) continue; // an email-only box is a newsletter signup, not a lead form
    count++;
    const action = attr(open, "action");
    if (action && /^http:\/\//i.test(action)) insecureAction = true;
  }
  return { count, insecureAction };
}

const WANT_PAGE = /contact|book|schedul|appoint|reserv|pricing|price|rates|packages|quote|estimate|services|about/i;

// Pulls same-site page links out of a chunk of HTML into `out`, applying the
// same safety/relevance filters every time: same-origin only, http(s) only (so
// mailto:/tel:/javascript: are dropped), no asset files, de-duped by path, up
// to `max` total. An optional `filter(href, text)` narrows which links qualify.
function collectLinks(
  html: string,
  baseUrl: URL,
  seen: Set<string>,
  out: string[],
  max: number,
  filter?: (href: string, text: string) => boolean,
): void {
  const re = /<a\b[^>]*href=(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi;
  for (const m of html.matchAll(re)) {
    if (out.length >= max) break;
    const href = m[2];
    const text = visibleText(m[3]).slice(0, 60);
    if (filter && !filter(href, text)) continue;
    let u: URL;
    try {
      u = new URL(href, baseUrl);
    } catch {
      continue;
    }
    if (u.origin !== baseUrl.origin || !/^https?:$/.test(u.protocol)) continue;
    if (/\.(pdf|jpe?g|png|gif|webp|zip|docx?|mp4)$/i.test(u.pathname)) continue;
    const key = u.origin + u.pathname.replace(/\/$/, "");
    if (seen.has(key)) continue;
    seen.add(key);
    u.hash = "";
    out.push(u.href);
  }
}

/** The site's primary navigation regions (header / <nav> / role="navigation"). */
function navRegions(html: string): string {
  const blocks: string[] = [];
  for (const re of [
    /<nav\b[\s\S]*?<\/nav>/gi,
    /<header\b[\s\S]*?<\/header>/gi,
    /<(?:ul|div)\b[^>]*role=["']navigation["'][\s\S]*?<\/(?:ul|div)>/gi,
  ]) {
    for (const m of html.matchAll(re)) blocks.push(m[0]);
  }
  return blocks.join("\n");
}

/** Same-site links worth following for the check (contact, booking, pricing, services, about). */
export function interestingLinks(html: string, base: string, max = 5): string[] {
  const baseUrl = new URL(base);
  const out: string[] = [];
  const seen = new Set([baseUrl.origin + baseUrl.pathname.replace(/\/$/, "")]);
  collectLinks(html, baseUrl, seen, out, max, (href, text) => WANT_PAGE.test(href) || WANT_PAGE.test(text));
  return out;
}

/**
 * Pages to crawl for the check, beyond the home page: the site's nav "tabs"
 * first (every primary page, keyword or not), then keyword-matched links from
 * anywhere on the page (e.g. a "Book now" button in the hero), de-duped and
 * capped at `max`. Same-origin and asset filters are enforced in collectLinks.
 */
export function pagesToCrawl(html: string, base: string, max = 12): string[] {
  const baseUrl = new URL(base);
  const out: string[] = [];
  const seen = new Set([baseUrl.origin + baseUrl.pathname.replace(/\/$/, "")]);
  collectLinks(navRegions(html), baseUrl, seen, out, max); // nav tabs — any same-site link in the menu
  collectLinks(html, baseUrl, seen, out, max, (href, text) => WANT_PAGE.test(href) || WANT_PAGE.test(text));
  return out;
}

// ---------- the check ----------

export function analyzeSite(inputUrl: string, pages: PageInput[], now = new Date()): SiteReport {
  const home = pages[0];
  const all = pages.map((p) => p.html).join("\n");
  const homeHtml = home?.html ?? "";
  const text = pages.map((p) => visibleText(p.html)).join("\n\n");

  const platform = PLATFORMS.find(([, re]) => re.test(all))?.[0] ?? null;

  const forms = pages.map((p) => leadForms(p.html));
  const formCount = forms.reduce((n, f) => n + f.count, 0);
  const formEmbeds = found(FORM_EMBEDS, all);
  const booking = found(BOOKING, all);
  const reviews = found(REVIEWS, all);
  const chat = found(CHAT, all);
  const email = found(EMAIL, all);
  const analytics = found(ANALYTICS, all);
  const social = found(SOCIAL, all);
  const telLinks = /href=["']tel:/i.test(all);
  const mailtoOnly = /href=["']mailto:/i.test(all);
  const phoneText = /(\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/.test(text);
  const quoteCta = /get (a|your) (free )?(quote|estimate)|request (a|an) (quote|estimate)|free (quote|estimate)|instant (quote|estimate)/i.test(text);
  const pricingPage = pages.some((p) => /pric|rates|packages/i.test(new URL(p.finalUrl).pathname)) || /\bpricing\b|\bour rates\b|\bpackages\b/i.test(text);
  const calculator = /calculator|estimate your|instant price/i.test(text);
  const bookingCta = /book (now|online|an appointment|a consultation|your)|schedule (now|online|an appointment|a consultation)/i.test(text);
  const hasLeadForm = formCount > 0 || formEmbeds.length > 0;

  const capabilities: Capability[] = [
    {
      key: "leadForm",
      label: "Lead / contact form",
      found: hasLeadForm,
      detail: hasLeadForm
        ? [formCount ? `${formCount} contact form${formCount > 1 ? "s" : ""}` : "", ...formEmbeds].filter(Boolean).join(", ")
        : mailtoOnly
          ? "Only an email link, no form"
          : "No contact form found",
    },
    {
      key: "booking",
      label: "Online booking",
      found: booking.length > 0,
      detail: booking.length ? booking.join(", ") : bookingCta ? '"Book" wording but no booking tool found' : "No online booking found",
    },
    {
      key: "quote",
      label: "Pricing or instant quote",
      found: pricingPage || calculator,
      detail: [pricingPage && "Pricing/rates shown", calculator && "Calculator or instant price", quoteCta && '"Get a quote" request'].filter(Boolean).join(", ") || (quoteCta ? "Quote requests only, no prices" : "No pricing or quote tool"),
    },
    { key: "reviews", label: "Reviews shown", found: reviews.length > 0, detail: reviews.join(", ") || (/testimonial/i.test(text) ? "Testimonials text only" : "No reviews widget") },
    { key: "chat", label: "Live chat", found: chat.length > 0, detail: chat.join(", ") || "No chat" },
    { key: "emailSignup", label: "Email list signup", found: email.length > 0, detail: email.join(", ") || "No email signup found" },
    { key: "analytics", label: "Analytics / tracking", found: analytics.length > 0, detail: analytics.join(", ") || "No analytics found" },
    { key: "clickToCall", label: "Tap-to-call phone link", found: telLinks, detail: telLinks ? "Yes" : phoneText ? "Phone number shown but not tappable" : "No phone number found" },
    { key: "social", label: "Social / Google profile links", found: social.length > 0, detail: social.join(", ") || "None linked" },
  ];

  // ---------- issues ----------
  const issues: SiteIssue[] = [];
  const add = (id: string, severity: Severity, title: string, detail: string) => issues.push({ id, severity, title, detail });

  if (!home || home.status >= 400) add("site-down", "high", "Home page didn't load", `The home page returned an error (${home?.status ?? "no response"}), so visitors may not be able to reach the site.`);
  if (home && !home.finalUrl.startsWith("https://")) add("no-https", "high", "Not secure (no HTTPS)", 'Browsers mark the site "Not secure", which puts visitors off and hurts search ranking.');
  if (homeHtml && !/<meta[^>]+name=["']viewport["']/i.test(homeHtml))
    add("not-mobile", "high", "Not set up for phones", "The site isn't built to resize for phones, where most local customers will find it.");
  if (!hasLeadForm)
    add("no-lead-form", "high", "No way to send an enquiry online", mailtoOnly ? "Visitors can only email or call; there's no form that captures their details." : "There's no contact form, so visitors who don't call are lost.");
  if (home && home.ms > 6000) add("slow", "high", "Very slow to load", `The home page took ${(home.ms / 1000).toFixed(1)} seconds to respond. Many visitors leave after 3.`);
  else if (home && home.ms > 3000) add("slow", "medium", "Slow to load", `The home page took ${(home.ms / 1000).toFixed(1)} seconds to respond.`);
  if (home?.truncated) add("heavy", "medium", "Very heavy page", "The home page is over 2 MB of code before images, which makes it slow on phones.");
  if (phoneText && !telLinks) add("no-tap-to-call", "medium", "Phone number isn't tap-to-call", "On a phone, visitors have to copy the number by hand instead of tapping to call.");
  if (forms.some((f) => f.insecureAction)) add("insecure-form", "medium", "Form sends details insecurely", "A form sends visitors' details over an unencrypted connection.");
  if (booking.length === 0 && bookingCta) add("book-no-tool", "medium", '"Book" buttons with no booking tool', "Visitors are asked to book but have to call or email to actually get a time.");
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(homeHtml)?.[1]?.trim() ?? "";
  if (homeHtml && title.length < 10) add("no-title", "medium", "Missing or weak page title", "The page title is what shows in Google results; it's missing or too short to help.");
  if (homeHtml && !/<meta[^>]+name=["']description["'][^>]+content=["'][^"']{30,}/i.test(homeHtml) && !/<meta[^>]+content=["'][^"']{30,}["'][^>]+name=["']description["']/i.test(homeHtml))
    add("no-description", "low", "No search description", "Google has no summary to show under the link, so it makes one up.");
  const h1s = (homeHtml.match(/<h1\b/gi) || []).length;
  if (homeHtml && h1s === 0) add("no-h1", "low", "No main heading", "The home page has no main heading, which makes it harder for Google and visitors to see what the business does.");
  if (homeHtml && !/property=["']og:(title|image)["']/i.test(homeHtml)) add("no-og", "low", "Links look bare when shared", "When the site is shared on Facebook or in a text, no preview image or title appears.");
  if (analytics.length === 0) add("no-analytics", "low", "No visitor tracking", "There's no analytics, so there's no way to know how many people visit or where they come from.");
  const years = [...text.matchAll(/(?:©|&copy;|copyright)\s*(?:\d{4}\s*[-–]\s*)?(\d{4})/gi)].map((m) => Number(m[1]));
  const latest = years.length ? Math.max(...years) : null;
  if (latest && latest < now.getFullYear() - 1) add("stale", "low", "Looks out of date", `The copyright says ${latest}, which can make visitors wonder if the business is still active.`);
  if (home?.finalUrl.startsWith("https://") && /(src|href)=["']http:\/\/(?!localhost)[^"']+\.(js|css|png|jpe?g|gif|webp)/i.test(homeHtml))
    add("mixed-content", "low", "Some content loads insecurely", "Parts of the page load over plain http, which can trigger browser warnings.");

  // ---------- module suggestions (catalog ids) ----------
  const suggestions: ModuleSuggestion[] = [];
  const suggest = (moduleId: string, reason: string) => suggestions.push({ moduleId, reason });
  if (!hasLeadForm) suggest("vw-lead", "No contact form; a lead form would capture visitors who don't call.");
  if (!booking.length) suggest("vw-booking", bookingCta ? '"Book" buttons with no booking tool behind them.' : "No online booking. Useful if they take appointments.");
  if (!pricingPage && !calculator) suggest("vw-quote", quoteCta ? "Quotes by request only; an instant estimate converts more visitors." : "No pricing or quote tool on the site.");
  if (!chat.length && (!hasLeadForm || (home?.ms ?? 0) > 3000)) suggest("vw-auto", "No instant reply to enquiries; automation answers every lead straight away.");
  if (!reviews.length) suggest("auto-reviews", "No reviews shown on the site.");
  if (!email.length) suggest("auto-nurture", "No email signup to keep in touch with past customers.");
  if (!analytics.length) suggest("vw-dashboard", "No tracking; a dashboard shows every lead and where it came from.");
  const serious = issues.filter((i) => i.severity !== "low").length;
  if (serious >= 2 || issues.some((i) => i.id === "not-mobile" || i.id === "site-down" || i.id === "no-https"))
    suggest("svc-site", `${serious} significant website problem${serious === 1 ? "" : "s"} found.`);

  // ---------- questionnaire prefill (applied only to empty answers) ----------
  const prefill: Answers = {};
  const finalHost = home ? new URL(home.finalUrl).hostname.replace(/^www\./, "") : "";
  if (finalHost) prefill.website = finalHost;
  prefill.sitePlatform = platform ?? "Custom / not sure";
  if (hasLeadForm) prefill.leadSources = ["Website form"];
  if (booking.length) {
    prefill.takesAppointments = "Yes";
    prefill.bookingMethod = "Online booking tool";
  }
  if (quoteCta || calculator) prefill.givesQuotes = "Yes";
  if (email.length) prefill.emailList = "Send occasionally";
  const tools = TOOL_OPTIONS.filter(([, re]) => re.test(all)).map(([o]) => o);
  if (tools.length) prefill.currentTools = tools;
  if (issues.length) prefill.siteObservations = "Website check: " + issues.map((i) => i.title).join("; ") + ".";

  return {
    inputUrl,
    finalUrl: home?.finalUrl ?? inputUrl,
    checkedAt: now.toISOString(),
    pages: pages.map((p) => ({ url: p.finalUrl, status: p.status, ms: p.ms })),
    platform,
    tools: [...new Set([...formEmbeds, ...booking, ...reviews, ...chat, ...email, ...analytics])],
    capabilities,
    issues: issues.sort((a, b) => ORDER[a.severity] - ORDER[b.severity]),
    suggestions,
    prefill,
    textExcerpt: text.slice(0, 12000),
  };
}

const ORDER: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

/** Only fills answers that are still empty, so nothing the operator entered is overwritten. */
export function applyPrefill(answers: Answers, prefill: Answers): Answers {
  const out = { ...answers };
  const empty = (v: unknown) => v === undefined || v === "" || (Array.isArray(v) && !v.length);
  for (const [k, v] of Object.entries(prefill)) if (empty(out[k])) out[k] = v;
  return out;
}
