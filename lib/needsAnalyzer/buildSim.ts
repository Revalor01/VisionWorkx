// Build simulator for the Needs Analyzer (/admin/needs-analyzer/simulator):
// pick a platform, hosting, domain, email, size and features, and get every
// step Revalor would take from hosting to deployment, the hours, the one-time
// cost/price and the running costs. Pure functions only. Deliberately separate
// from rules.ts / questions.ts (mirrored in the offline app) — nothing here
// touches module scoring.
//
// Third-party prices change often. They are starting points as of PRICES_AS_OF
// (US list prices, annual billing where that's cheaper), shown on the page with
// that date, and every one can be overridden on screen. Verify before quoting.

export const PRICES_AS_OF = "November 2026";

export type PlatformKey = "wordpress" | "squarespace" | "wix" | "webflow" | "shopify" | "nextjs";
export type HostingKey = "included" | "vercel" | "netlify" | "cloudflare" | "siteground" | "wpengine";
export type RegistrarKey = "cloudflare" | "porkbun" | "namecheap" | "godaddy";
export type EmailKey = "none" | "google" | "microsoft" | "zoho";
export type SizeKey = "small" | "medium" | "large";
export type DesignKey = "template" | "custom";
export type ContentKey = "client" | "revalor";
export type CareKey = "none" | "basic" | "full";
export type FeatureKey = "forms" | "booking" | "store" | "blog" | "seo" | "analytics" | "modules";

export interface SimInput {
  platform: PlatformKey;
  hosting: HostingKey;
  registrar: RegistrarKey;
  email: EmailKey;
  mailboxes: number;
  size: SizeKey;
  design: DesignKey;
  content: ContentKey;
  features: FeatureKey[];
  care: CareKey;
}

/** Every price the simulator uses, overridable on screen. Monthly unless named Yearly. */
export interface SimPrices {
  platformMonthly: Record<PlatformKey, number>;
  /** Plan upgrade some builders need for a store or CMS/blog (added to platformMonthly). */
  platformUpgradeMonthly: Record<PlatformKey, number>;
  hostingMonthly: Record<HostingKey, number>;
  domainYearly: Record<RegistrarKey, number>;
  emailPerMailboxMonthly: Record<EmailKey, number>;
  /** Third-party apps/plugins a feature usually needs (e.g. a booking app). */
  featureMonthly: Record<FeatureKey, number>;
  /** Premium theme / plugin licences for a WordPress build, per year. */
  wordpressLicencesYearly: number;
}

export interface Rates {
  /** Revalor's internal cost per hour (Catalog & pricing → internal rate). */
  internalRate: number;
  /** Target margin %, used for the suggested client price. */
  targetMarginPct: number;
}

interface Option<K extends string> {
  key: K;
  label: string;
  note?: string;
}

export const PLATFORMS: (Option<PlatformKey> & { hosting: HostingKey[]; kind: "builder" | "wordpress" | "custom" })[] = [
  { key: "wordpress", label: "WordPress (self-hosted)", kind: "wordpress", hosting: ["siteground", "wpengine"], note: "Most flexible; needs updates, backups and security care." },
  { key: "squarespace", label: "Squarespace", kind: "builder", hosting: ["included"], note: "Client owns the account; hosting included." },
  { key: "wix", label: "Wix", kind: "builder", hosting: ["included"], note: "Client owns the account; hosting included." },
  { key: "webflow", label: "Webflow", kind: "builder", hosting: ["included"], note: "Close design control without custom code; hosting included." },
  { key: "shopify", label: "Shopify", kind: "builder", hosting: ["included"], note: "Best when selling products is the point." },
  { key: "nextjs", label: "Custom (Next.js, built by Revalor)", kind: "custom", hosting: ["vercel", "netlify", "cloudflare"], note: "Full control; Revalor hosts and maintains — needs a retainer." },
];

export const HOSTING: Option<HostingKey>[] = [
  { key: "included", label: "Included with the platform" },
  { key: "vercel", label: "Vercel Pro", note: "Hobby (free) is non-commercial only; client sites go on a paid Pro team." },
  { key: "netlify", label: "Netlify Pro", note: "Credit-based billing; heavy traffic can cost more." },
  { key: "cloudflare", label: "Cloudflare Pages", note: "Free tier is aimed at non-business-critical use; check terms or use a paid plan." },
  { key: "siteground", label: "SiteGround (StartUp)", note: "Intro price is low; budget the renewal price shown here." },
  { key: "wpengine", label: "WP Engine (Startup)", note: "Managed WordPress: backups, updates, staging." },
];

export const REGISTRARS: Option<RegistrarKey>[] = [
  { key: "cloudflare", label: "Cloudflare", note: "At-cost renewals." },
  { key: "porkbun", label: "Porkbun" },
  { key: "namecheap", label: "Namecheap" },
  { key: "godaddy", label: "GoDaddy", note: "Renewals and add-ons cost more." },
];

export const EMAILS: Option<EmailKey>[] = [
  { key: "none", label: "No business email" },
  { key: "google", label: "Google Workspace (Business Starter)" },
  { key: "microsoft", label: "Microsoft 365 (Business Basic)" },
  { key: "zoho", label: "Zoho Mail (Mail Lite)" },
];

export const SIZES: (Option<SizeKey> & { pages: number })[] = [
  { key: "small", label: "Small — about 5 pages", pages: 5 },
  { key: "medium", label: "Medium — about 12 pages", pages: 12 },
  { key: "large", label: "Large — about 25 pages", pages: 25 },
];

export const DESIGNS: Option<DesignKey>[] = [
  { key: "template", label: "Template, customised to the brand" },
  { key: "custom", label: "Custom design" },
];

export const CONTENTS: Option<ContentKey>[] = [
  { key: "client", label: "Client supplies text and photos" },
  { key: "revalor", label: "Revalor writes the content" },
];

export const CARE_PLANS: (Option<CareKey> & { hoursMonthly: number })[] = [
  { key: "none", label: "No care plan (handed over)", hoursMonthly: 0 },
  { key: "basic", label: "Basic — updates, backups, small edits", hoursMonthly: 1 },
  { key: "full", label: "Full — basic + monthly changes and reporting", hoursMonthly: 3 },
];

export const FEATURES: (Option<FeatureKey> & { hours: number })[] = [
  { key: "forms", label: "Contact / lead forms", hours: 2 },
  { key: "booking", label: "Online booking", hours: 4, note: "Usually a booking app subscription unless a VisionWorkx booking module is used." },
  { key: "store", label: "Online store", hours: 10 },
  { key: "blog", label: "Blog / news", hours: 3 },
  { key: "seo", label: "SEO setup (titles, sitemap, Google Business Profile)", hours: 4 },
  { key: "analytics", label: "Analytics", hours: 1.5 },
  { key: "modules", label: "VisionWorkx modules embedded", hours: 2, note: "Module pricing comes from the assessment, not here." },
];

export const DEFAULT_PRICES: SimPrices = {
  platformMonthly: { wordpress: 0, squarespace: 19, wix: 17, webflow: 15, shopify: 29, nextjs: 0 },
  platformUpgradeMonthly: { wordpress: 0, squarespace: 10, wix: 12, webflow: 10, shopify: 0, nextjs: 0 },
  hostingMonthly: { included: 0, vercel: 20, netlify: 20, cloudflare: 0, siteground: 18, wpengine: 30 },
  domainYearly: { cloudflare: 11, porkbun: 11, namecheap: 16, godaddy: 22 },
  emailPerMailboxMonthly: { none: 0, google: 7, microsoft: 6, zoho: 1 },
  featureMonthly: { forms: 0, booking: 12, store: 0, blog: 0, seo: 0, analytics: 0, modules: 0 },
  wordpressLicencesYearly: 150,
};

export const DEFAULT_INPUT: SimInput = {
  platform: "squarespace",
  hosting: "included",
  registrar: "cloudflare",
  email: "google",
  mailboxes: 2,
  size: "small",
  design: "template",
  content: "client",
  features: ["forms", "seo", "analytics"],
  care: "basic",
};

/** Hosting choices that fit a platform (the first is the default). */
export const hostingFor = (platform: PlatformKey): HostingKey[] => PLATFORMS.find((p) => p.key === platform)?.hosting ?? ["included"];

/** The input with hosting snapped to one that fits the platform. */
export function normalizeInput(input: SimInput): SimInput {
  const allowed = hostingFor(input.platform);
  return {
    ...input,
    hosting: allowed.includes(input.hosting) ? input.hosting : allowed[0],
    mailboxes: input.email === "none" ? 0 : Math.max(1, Math.round(input.mailboxes || 1)),
    features: [...new Set(input.features)],
  };
}

export interface SimStep {
  key: string;
  phase: "Plan" | "Set up" | "Design & build" | "Launch" | "After launch";
  label: string;
  detail: string;
  hours: number;
}

export interface RunningLine {
  key: string;
  label: string;
  monthly: number;
  payer: "Client" | "Revalor";
}

export interface SimResult {
  input: SimInput;
  pages: number;
  steps: SimStep[];
  buildHours: number;
  contingencyHours: number;
  totalHours: number;
  /** Revalor's internal cost for the build (hours × internal rate). */
  buildCost: number;
  /** Suggested one-time client price at the target margin, rounded up to the next $50. */
  buildPrice: number;
  running: RunningLine[];
  runningMonthlyClient: number;
  runningMonthlyRevalor: number;
  runningMonthly: number;
  runningYearly: number;
  /** Care plan: internal cost and suggested monthly price. */
  careCost: number;
  carePrice: number;
  /** Working days at 6 focused hours a day, and calendar weeks allowing for client feedback. */
  workDays: number;
  calendarWeeks: number;
  risks: string[];
}

const CONTINGENCY_PCT = 15;
const round1 = (n: number) => Math.round(n * 10) / 10;
const ceil50 = (n: number) => Math.ceil(n / 50) * 50;
const label = <K extends string>(list: Option<K>[], key: K) => list.find((o) => o.key === key)?.label ?? key;

/** Price that leaves `marginPct` margin on `cost`. */
export const priceAtMargin = (cost: number, marginPct: number) => (marginPct >= 100 ? cost : cost / (1 - Math.max(0, marginPct) / 100));

export function simulate(raw: SimInput, prices: SimPrices, rates: Rates): SimResult {
  const input = normalizeInput(raw);
  const platform = PLATFORMS.find((p) => p.key === input.platform)!;
  const pages = SIZES.find((s) => s.key === input.size)!.pages;
  const has = (f: FeatureKey) => input.features.includes(f);
  const isWp = platform.kind === "wordpress";
  const isCustom = platform.kind === "custom";

  const perPage = isCustom ? 1.25 : isWp || input.platform === "webflow" ? 1.5 : 1;
  const steps: SimStep[] = ([
    { key: "discovery", phase: "Plan", label: "Discovery & sitemap", detail: "Goals, audience, pages and calls to action agreed in writing.", hours: 2 + pages * 0.1 },
    { key: "agreement", phase: "Plan", label: "Agreement & access", detail: "Written agreement on ownership and maintenance; account invites or delegated access.", hours: 1 },
    { key: "domain", phase: "Set up", label: `Domain & DNS (${label(REGISTRARS, input.registrar)})`, detail: "Register or transfer the domain in the client's name; set DNS records.", hours: 1 },
    {
      key: "hosting",
      phase: "Set up",
      label: `Hosting & platform setup (${isCustom || isWp ? label(HOSTING, input.hosting) : platform.label})`,
      detail: isCustom
        ? "Project on Revalor's team, environments, preview deployments, domain connection."
        : isWp
          ? "Hosting account, WordPress install, theme, core plugins, staging site."
          : "Client account on the plan that fits, site created from the chosen template.",
      hours: isWp ? 2.5 : isCustom ? 2 : 1,
    },
    { key: "ssl", phase: "Set up", label: "SSL & security", detail: isWp ? "HTTPS, security plugin, automatic backups, admin hardening." : "HTTPS certificate and redirects (automatic on this platform).", hours: isWp ? 1.5 : 0.25 },
    ...(input.email !== "none"
      ? [{ key: "email", phase: "Set up" as const, label: `Business email (${label(EMAILS, input.email)})`, detail: `${input.mailboxes} mailbox${input.mailboxes === 1 ? "" : "es"}; SPF, DKIM and DMARC so mail isn't marked as spam.`, hours: 1 + input.mailboxes * 0.25 }]
      : []),
    {
      key: "design",
      phase: "Design & build",
      label: input.design === "custom" ? "Custom design" : "Template design",
      detail: input.design === "custom" ? "Brand-led layouts for key pages, one round of revisions." : "Template adapted to the brand: colours, fonts, logo, imagery.",
      hours: input.design === "custom" ? 10 + pages * 0.75 : 3 + pages * 0.25,
    },
    { key: "build", phase: "Design & build", label: `Build ${pages} pages`, detail: isCustom ? "Pages built with Claude Code and reviewed." : "Pages laid out and connected; navigation and footer.", hours: pages * perPage },
    {
      key: "content",
      phase: "Design & build",
      label: input.content === "revalor" ? "Write the content" : "Load the client's content",
      detail: input.content === "revalor" ? "Copy for every page, image selection and optimisation." : "Format supplied text, resize and optimise photos.",
      hours: input.content === "revalor" ? pages * 1.5 : pages * 0.25,
    },
    ...FEATURES.filter((f) => has(f.key)).map((f) => ({
      key: `feature-${f.key}`,
      phase: "Design & build" as const,
      label: f.label,
      detail: f.note ?? "Set up, connected and tested end to end.",
      hours: isCustom && f.key === "store" ? f.hours * 1.5 : f.hours,
    })),
    { key: "seo-basics", phase: "Design & build", label: "On-page basics", detail: "Page titles, descriptions, social previews, favicon, 404 page.", hours: 1 },
    { key: "legal", phase: "Design & build", label: has("store") ? "Privacy policy, terms & refund policy" : "Privacy policy", detail: "Required with any form or analytics; linked in the footer.", hours: has("store") ? 1.5 : 1 },
    { key: "testing", phase: "Launch", label: "Accessibility & mobile testing", detail: "Phones, tablets, desktop; contrast, alt text, keyboard; forms tested.", hours: 1 + pages * 0.15 },
    { key: "launch", phase: "Launch", label: isCustom ? "Deploy to production" : "Go live", detail: isCustom ? "Production deploy, domain + HTTPS, smoke test, monitoring." : "Point the domain, check HTTPS and redirects, submit the sitemap.", hours: isWp ? 1.5 : 1 },
    { key: "handoff", phase: "After launch", label: "Handoff & training", detail: "Logins in the client's name, a short walkthrough video, how-to notes.", hours: 1.5 },
  ] as SimStep[]).map((s) => ({ ...s, hours: round1(s.hours) }));

  const buildHours = round1(steps.reduce((a, s) => a + s.hours, 0));
  const contingencyHours = round1((buildHours * CONTINGENCY_PCT) / 100);
  const totalHours = round1(buildHours + contingencyHours);
  const buildCost = Math.round(totalHours * rates.internalRate);
  const buildPrice = ceil50(priceAtMargin(buildCost, rates.targetMarginPct));

  const needsUpgrade = has("store") || (has("blog") && input.platform === "webflow");
  const hostPayer: RunningLine["payer"] = isCustom ? "Revalor" : "Client";
  const running: RunningLine[] = ([
    ...(prices.platformMonthly[input.platform] > 0 || (needsUpgrade && prices.platformUpgradeMonthly[input.platform] > 0)
      ? [{ key: "platform", label: `${platform.label} plan${needsUpgrade && prices.platformUpgradeMonthly[input.platform] > 0 ? " (store/CMS tier)" : ""}`, monthly: prices.platformMonthly[input.platform] + (needsUpgrade ? prices.platformUpgradeMonthly[input.platform] : 0), payer: "Client" as const }]
      : []),
    ...(input.hosting !== "included" ? [{ key: "hosting", label: label(HOSTING, input.hosting), monthly: prices.hostingMonthly[input.hosting], payer: hostPayer }] : []),
    ...(isWp && prices.wordpressLicencesYearly > 0 ? [{ key: "licences", label: "Premium theme & plugin licences", monthly: prices.wordpressLicencesYearly / 12, payer: "Client" as const }] : []),
    { key: "domain", label: `Domain (${label(REGISTRARS, input.registrar)})`, monthly: prices.domainYearly[input.registrar] / 12, payer: "Client" },
    ...(input.email !== "none" ? [{ key: "email", label: `${label(EMAILS, input.email)} × ${input.mailboxes}`, monthly: prices.emailPerMailboxMonthly[input.email] * input.mailboxes, payer: "Client" as const }] : []),
    ...FEATURES.filter((f) => has(f.key) && prices.featureMonthly[f.key] > 0).map((f) => ({ key: `app-${f.key}`, label: `${f.label} app`, monthly: prices.featureMonthly[f.key], payer: "Client" as const })),
  ] as RunningLine[]).map((l) => ({ ...l, monthly: Math.round(l.monthly * 100) / 100 }));

  const sum = (payer?: RunningLine["payer"]) => Math.round(running.filter((l) => !payer || l.payer === payer).reduce((a, l) => a + l.monthly, 0) * 100) / 100;
  const careHours = CARE_PLANS.find((c) => c.key === input.care)!.hoursMonthly;
  const careCost = Math.round(careHours * rates.internalRate);
  const carePrice = careCost ? Math.ceil(priceAtMargin(careCost, rates.targetMarginPct) / 5) * 5 : 0;

  const risks: string[] = [];
  if (input.hosting === "vercel") risks.push("Vercel's free Hobby plan is non-commercial — this must run on Revalor's paid Pro team.");
  if (input.hosting === "cloudflare") risks.push("Cloudflare's free tier is meant for non-business-critical sites — confirm the terms or budget a paid plan.");
  if (input.hosting === "siteground") risks.push("SiteGround's intro price jumps at renewal; the renewal price is what's budgeted here.");
  if (isWp) risks.push("WordPress needs regular core, theme and plugin updates — without a care plan it becomes a security risk.");
  if (isCustom && input.care === "none") risks.push("Revalor hosts a custom site — handing it over with no care plan leaves no one maintaining it.");
  if (platform.kind === "builder") risks.push("The client owns and pays for the platform account; build through invite access, never on Revalor's login.");
  if (has("store")) risks.push("Online store: card fees (about 2.9% + 30¢), taxes and shipping rules need the client's decisions before build.");
  if (has("booking") && !has("modules")) risks.push("Booking usually means another subscription — a VisionWorkx booking module may replace it.");
  if (input.content === "client") risks.push("Late client content is the most common delay — agree a content deadline up front.");
  if (input.design === "custom" && platform.kind === "builder") risks.push("Custom design on a builder is limited by its templates — agree what's possible early.");

  const workDays = Math.max(1, Math.ceil(totalHours / 6));
  return {
    input,
    pages,
    steps,
    buildHours,
    contingencyHours,
    totalHours,
    buildCost,
    buildPrice,
    running,
    runningMonthlyClient: sum("Client"),
    runningMonthlyRevalor: sum("Revalor"),
    runningMonthly: sum(),
    runningYearly: Math.round(sum() * 12),
    careCost,
    carePrice,
    workDays,
    calendarWeeks: Math.max(1, Math.ceil(workDays / 3)),
    risks,
  };
}
