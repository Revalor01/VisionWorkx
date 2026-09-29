// Rules engine: scores each catalog module against the questionnaire answers,
// builds the phased plan, prices it, checks ecosystem readiness, and estimates impact.
// Ported from the offline Needs Analyzer (revalor-needs-analyzer/public/rules.js);
// the scoring must stay identical so an assessment gives the same plan in both apps
// (rules.test.ts pins the sample assessment's plan).
import type { Answers, Assessment, Catalog, CatalogModule, CustomItem, EcoTool, Ecosystem } from "./types";

export const WIDGETS = ["vw-lead", "vw-booking", "vw-quote", "vw-intake"];

function helpers(A: Answers) {
  const is = (k: string, ...v: unknown[]) => v.includes(A[k]);
  const inList = (k: string, v: string) => ((A[k] as string[] | undefined) || []).includes(v);
  const n = (k: string) => {
    const x = Number(A[k]);
    return Number.isFinite(x) ? x : 0;
  };
  const goal = (g: string) => inList("goals", g);
  const yes = (k: string) => A[k] === "Yes";
  const hasSite = !!A.sitePlatform && A.sitePlatform !== "No website";
  const text = (k: string) => String(A[k] || "").trim();
  return { is, inList, n, goal, yes, hasSite, text };
}
type Helpers = ReturnType<typeof helpers>;

interface Scorer {
  add(pts: number, reason?: string | null, flag?: string): void;
  flag(f: string): void;
}

const s = (A: Answers, k: string) => String(A[k] ?? "");

// Each rule adds points, client-facing reasons, and internal-only flags.
const RULES: Record<string, (A: Answers, h: Helpers, r: Scorer) => void> = {
  "vw-lead"(A, h, r) {
    if (!h.inList("leadSources", "Website form")) r.add(25, "The website has no working lead form, so visitors have to call or email");
    if (h.is("leadTracking", "Nowhere", "Paper / notebook", "Email inbox"))
      r.add(20, `Leads are tracked ${({ Nowhere: "nowhere", "Paper / notebook": "on paper", "Email inbox": "in an email inbox" } as Record<string, string>)[s(A, "leadTracking")]}, which makes them easy to lose`);
    if (h.n("lostLeads") >= 3) r.add(20, "Leads are slipping through the cracks today");
    if (h.is("responseTime", "1–2 days", "Longer / inconsistent")) r.add(15, "New leads wait a day or more for a response");
    if (h.goal("More leads")) r.add(20, "Growing leads is a top goal");
    if (!h.hasSite) r.flag("No website yet — pair with Website Enhancement.");
  },
  "vw-booking"(A, h, r) {
    if (!h.yes("takesAppointments")) return;
    r.add(30, "Customers book appointments");
    if (h.is("bookingMethod", "Phone / text", "Email back-and-forth")) r.add(35, `Booking happens by ${s(A, "bookingMethod").toLowerCase()}, which costs time on both sides`);
    if (h.is("bookingMethod", "Online booking tool")) r.add(-25, null, "Already uses an online booking tool — only replace it if it is failing them.");
    if (h.n("noShows") >= 3) r.add(10, "No-shows are a recurring problem");
    if (h.goal("Save time")) r.add(10, "Saving time is a top goal");
  },
  "vw-quote"(A, h, r) {
    if (!h.yes("givesQuotes")) return;
    r.add(10, "They quote or estimate work");
    if (h.is("quoteTime", "Several hours", "Days")) r.add(30, `A typical quote takes ${s(A, "quoteTime").toLowerCase()}`);
    if (h.is("pricingComplexity", "A few options / packages")) r.add(35, "Pricing is structured enough to calculate instantly online");
    if (h.is("pricingComplexity", "Fixed prices")) r.add(20, "Fixed pricing can be shown instantly on the website");
    if (h.is("pricingComplexity", "Depends on many factors")) r.add(-30, null, "Complex pricing — the Custom Pricing & Quote Engine may fit better than a widget.");
    if (h.goal("More leads")) r.add(10, "Instant estimates convert more website visitors into leads");
  },
  "vw-intake"(A, h, r) {
    if (h.is("industry", "Health & wellness", "Beauty & salon", "Fitness", "Professional services", "Real estate"))
      r.add(30, `${s(A, "industry")} businesses usually need intake details before the first visit`);
    if (h.yes("clientDocs")) r.add(30, "Customers send documents or forms today");
    if (h.yes("takesAppointments")) r.add(10, "Intake can be completed before appointments");
  },
  "vw-auto"(A, h, r) {
    if (h.is("followUp", "We don't follow up", "Manually, when we remember")) r.add(0, "Follow-up depends on someone remembering");
    if (h.is("responseTime", "Same day", "1–2 days", "Longer / inconsistent")) r.add(0, "Every lead and booking gets an instant reply, even after hours");
  },
  "vw-dashboard"(A, h, r) {
    if (h.is("leadTracking", "Nowhere", "Paper / notebook", "Spreadsheet", "Email inbox")) r.add(30, "There is no single place to see every lead and its status");
    if (h.n("leadsPerMonth") >= 15) r.add(20, `About ${h.n("leadsPerMonth")} leads a month is too many to track by memory`);
    if (h.n("leadsPerMonth") >= 40) r.add(10);
    if (h.n("lostLeads") >= 3) r.add(15);
    if (h.goal("Understand my numbers")) r.add(10, "They want to understand their numbers");
  },
  "auto-reminders"(A, h, r) {
    if (!h.yes("takesAppointments")) return;
    const ns = h.n("noShows");
    if (ns >= 3) r.add(40 + (ns - 3) * 15, "No-shows and late cancellations are costing them");
    if (h.goal("Fewer no-shows")) r.add(25, "Reducing no-shows is a top goal");
  },
  "auto-reviews"(A, h, r) {
    if (h.is("reviewsAsk", "Never", "Sometimes")) r.add(35, `They ${s(A, "reviewsAsk").toLowerCase()} ask for reviews`);
    const g = A.googleReviews === "" || A.googleReviews == null ? null : h.n("googleReviews");
    if (g !== null && g < 25) r.add(20, `Only about ${g} Google reviews today`);
    else if (g !== null && g < 100) r.add(10);
    if (h.goal("More reviews")) r.add(30, "More reviews is a top goal");
  },
  "auto-referral"(A, h, r) {
    const ref = h.n("referralsImportant");
    if (ref >= 4) r.add(40, "Most of the business comes from referrals");
    else if (ref === 3) r.add(20, "Referrals are a meaningful source of business");
    if (h.inList("leadSources", "Referrals")) r.add(15);
    if (h.is("repeatCustomers", "A mix", "Mostly repeat")) r.add(5);
  },
  "auto-nurture"(A, h, r) {
    if (h.is("emailList", "Have one, don't use it")) r.add(35, "They have a customer email list that is not being used");
    if (h.is("emailList", "No list") && h.is("repeatCustomers", "A mix", "Mostly repeat")) r.add(20, "Repeat customers are not being kept in touch with");
    if (h.yes("givesQuotes") && h.is("followUp", "We don't follow up", "Manually, when we remember")) r.add(25, "Quotes that go quiet are not followed up");
    if (h.is("repeatCustomers", "Mostly repeat")) r.add(15);
  },
  proactive(A, h, r) {
    if (h.is("managers", "2–5", "6+")) r.add(30, `They have ${s(A, "managers")} managers or team leads`);
    if (h.is("managers", "1")) r.add(15);
    if (h.n("ownerOverwhelm") >= 4) r.add(30, "The owner is stretched thin by decisions and people issues");
    if (h.goal("Grow the team")) r.add(25, "Growing the team is a top goal");
    if (h.is("teamSize", "6–20", "21–50", "50+")) r.add(10);
  },
  "cb-invoicing"(A, h, r) {
    if (h.is("invoicing", "Paper", "Word / Excel templates")) r.add(40, `Invoices are made with ${s(A, "invoicing").toLowerCase()}`);
    if (h.n("latePayments") >= 3) r.add(25, "Chasing late payments is a regular job");
    if (h.goal("Get paid faster")) r.add(25, "Getting paid faster is a top goal");
    if (h.is("invoicing", "QuickBooks / Xero", "Square / Stripe"))
      r.add(-15, null, `Already invoices with ${s(A, "invoicing")} — only add payment reminders/links if missing.`);
  },
  "cb-integration"(A, h, r) {
    const tools = (A.currentTools as string[] | undefined) || [];
    if (h.yes("needsIntegration")) r.add(45, "The same data is copied between tools by hand");
    if (tools.length >= 4) r.add(20, `They juggle ${tools.length} separate tools`);
  },
  "cb-spreadsheet"(A, h, r) {
    const n = h.n("spreadsheetsCount");
    if (n >= 3) r.add(40, `${n} spreadsheets help run the business`);
    if (n >= 6) r.add(15);
    if (h.is("leadTracking", "Spreadsheet")) r.add(10);
    if (h.is("tracksJobs", "Spreadsheet")) r.add(10);
  },
  "cb-reporting"(A, h, r) {
    if (h.goal("Understand my numbers")) r.add(40, "They want a clear view of their numbers");
    if (!h.is("locations", "1", undefined, "")) r.add(25, `They run ${s(A, "locations")} locations`);
    if (h.is("teamSize", "21–50", "50+")) r.add(15);
  },
  "cb-jobs"(A, h, r) {
    if (h.is("tracksJobs", "In the owner's head", "Paper", "Spreadsheet"))
      r.add(35, `Jobs are tracked ${({ "In the owner's head": "in the owner's head", Paper: "on paper", Spreadsheet: "in a spreadsheet" } as Record<string, string>)[s(A, "tracksJobs")]}`);
    if (A.teamSize && !h.is("teamSize", "Just me")) r.add(20, "Several people need to see job status");
    if (h.is("industry", "Home services / trades")) r.add(15);
  },
  "cb-staff"(A, h, r) {
    if (h.is("staffScheduling", "Paper / whiteboard", "Spreadsheet", "Group texts")) r.add(35, `Staff are scheduled by ${s(A, "staffScheduling").toLowerCase()}`);
    if (h.is("teamSize", "6–20", "21–50", "50+")) r.add(25, "The team is big enough that scheduling eats real time");
  },
  "cb-inventory"(A, h, r) {
    if (h.yes("hasInventory") && h.is("inventoryMethod", "Not tracked", "Spreadsheet"))
      r.add(60, `Inventory is ${A.inventoryMethod === "Not tracked" ? "not tracked" : "tracked in a spreadsheet"}`);
    if (h.yes("hasInventory") && h.is("industry", "Retail")) r.add(10);
  },
  "cb-quote-engine"(A, h, r) {
    if (h.yes("givesQuotes") && h.is("pricingComplexity", "Depends on many factors")) r.add(45, "Pricing depends on many factors, so quotes take real effort");
    if (h.yes("givesQuotes") && h.is("quoteTime", "Several hours", "Days")) r.add(25, `A typical quote takes ${s(A, "quoteTime").toLowerCase()}`);
  },
  "cb-portal"(A, h, r) {
    if (h.yes("clientDocs")) r.add(40, "Customers exchange documents and ask for status updates");
    if (h.is("repeatCustomers", "Mostly repeat")) r.add(10);
    if (h.goal("Better customer experience")) r.add(20, "Customer experience is a top goal");
  },
  "cb-unique"(A, h, r) {
    const t = h.text("uniqueProcess");
    if (t.length > 15) r.add(60, `Off-the-shelf tools don't fit: "${t.length > 140 ? t.slice(0, 137) + "…" : t}"`);
  },
  "svc-site"(A, h, r) {
    if (!h.hasSite && A.sitePlatform) r.add(70, "There is no website yet to host these tools");
    const happy = h.n("siteHappy");
    if (happy && happy <= 2) r.add(40, "They are unhappy with their current website");
    else if (happy === 3) r.add(15);
    if (h.text("siteObservations").length > 10) r.add(15, null, "Site issues noted: " + h.text("siteObservations"));
  },
};

export interface ScoredModule extends CatalogModule {
  score: number;
  reasons: string[];
  flags: string[];
  recommended: boolean;
  autoReason?: string;
}

function scoreModule(mod: CatalogModule, A: Answers) {
  const h = helpers(A);
  const out = { score: 0, reasons: [] as string[], flags: [] as string[] };
  const r: Scorer = {
    add(pts, reason, flag) {
      out.score += pts || 0;
      if (reason) out.reasons.push(reason);
      if (flag) out.flags.push(flag);
    },
    flag(f) {
      out.flags.push(f);
    },
  };
  RULES[mod.id]?.(A, h, r);
  out.score = Math.max(0, Math.min(100, out.score));
  return out;
}

const BUDGET_MAX: Record<string, number> = { "Under $1k": 1000, "$1k–$3k": 3000, "$3k–$10k": 10000, "$10k+": Infinity };
const MONTHLY_MAX: Record<string, number> = { "Under $50": 50, "$50–$150": 150, "$150–$500": 500, "$500+": Infinity };

export type CapStatus = "ready" | "unconfirmed" | "gap";

export function capabilityStatus(capId: string, eco: Partial<Ecosystem>): { status: CapStatus; tools: EcoTool[] } {
  const tools = (eco.tools || []).filter((t) => (t.provides || []).includes(capId));
  if (tools.some((t) => t.status === "In use")) return { status: "ready", tools };
  if (tools.length) return { status: "unconfirmed", tools };
  return { status: "gap", tools: [] };
}

export interface PlanItem {
  id: string;
  name: string;
  description: string;
  category: string;
  phase: number;
  qty: number;
  setup: number;
  monthly: number;
  setupTotal: number;
  monthlyTotal: number;
  effortHours: number;
  hoursSavedPerWeek: number;
  requires: string[];
  reasons: string[];
  flags: string[];
  score: number | null;
  custom: boolean;
  recommended?: boolean;
  autoReason?: string;
}

export interface PlanPhase {
  key: string;
  name: string;
  timing: string;
  items: PlanItem[];
  setup: number;
  monthly: number;
}

export interface Plan {
  all: ScoredModule[];
  items: PlanItem[];
  phases: PlanPhase[];
  setupGross: number;
  discountPct: number;
  discount: number;
  setupNet: number;
  monthly: number;
  effortHours: number;
  internalCost: number;
  margin: number;
  budget: { setupOk: boolean | null; monthlyOk: boolean | null; phase1Ok: boolean | null };
  hoursSaved: number;
  timeValue: number;
  recoveredLeads: number;
  extraRevenue: number;
  monthlyValue: number;
  paybackMonths: number | null;
  readiness: { id: string; name: string; caps: { id: string; name: string; status: CapStatus; tools: EcoTool[] }[]; status: CapStatus }[];
  openQuestions: string[];
  threshold: number;
}

export function computePlan(assessment: Pick<Assessment, "answers" | "overrides">, catalog: Catalog, eco: Ecosystem | null): Plan {
  const A = assessment.answers || {};
  const ov = assessment.overrides || {};
  const excluded = new Set(ov.excluded || []);
  const added = new Set(ov.added || []);
  const prices = ov.prices || {};
  const S = catalog.settings || ({} as Catalog["settings"]);
  const threshold = Number(S.includeThreshold ?? 45);
  const h = helpers(A);

  const all: ScoredModule[] = catalog.modules
    .filter((m) => m.active !== false)
    .map((m) => {
      const sc = scoreModule(m, A);
      return { ...m, ...sc, recommended: sc.score >= threshold };
    });
  const byId: Record<string, ScoredModule> = Object.fromEntries(all.map((m) => [m.id, m]));

  const included = new Set(all.filter((m) => (m.recommended || added.has(m.id)) && !excluded.has(m.id)).map((m) => m.id));
  // Companion rules
  if (WIDGETS.some((id) => included.has(id)) && byId["vw-auto"] && !excluded.has("vw-auto")) {
    included.add("vw-auto");
    byId["vw-auto"].autoReason = "Included free with every VisionWorkx widget";
  }
  const hasCustom = [...included].some((id) => byId[id]?.category === "Custom Build") || (ov.custom || []).length > 0;
  for (const id of ["svc-discovery", "svc-maint"]) {
    if (hasCustom && byId[id] && !excluded.has(id)) {
      included.add(id);
      byId[id].autoReason = "Included with every custom build";
    }
  }

  const leaders = ({ None: 1, "1": 2, "2–5": 4, "6+": 7 } as Record<string, number>)[s(A, "managers")] || 1;
  const items: PlanItem[] = [...included]
    .map((id) => byId[id])
    .filter(Boolean)
    .map((m) => {
      const p = prices[m.id] || {};
      const qty = Number(p.qty ?? (m.id === "proactive" ? leaders : 1)) || 1;
      const setup = Number(p.setup ?? m.setup) || 0;
      const monthly = Number(p.monthly ?? m.monthly) || 0;
      return {
        ...m,
        requires: m.requires || [],
        qty,
        setup,
        monthly,
        setupTotal: setup * qty,
        monthlyTotal: monthly * qty,
        custom: false,
      };
    });
  for (const c of ov.custom || ([] as CustomItem[])) {
    const qty = Number(c.qty || 1);
    items.push({
      id: c.id,
      name: c.name || "Custom item",
      description: c.description || "",
      category: "Custom Build",
      phase: Number(c.phase || 3),
      qty,
      setup: Number(c.setup) || 0,
      monthly: Number(c.monthly) || 0,
      setupTotal: (Number(c.setup) || 0) * qty,
      monthlyTotal: (Number(c.monthly) || 0) * qty,
      effortHours: Number(c.effortHours) || 0,
      hoursSavedPerWeek: Number(c.hoursSavedPerWeek) || 0,
      requires: c.requires || [],
      reasons: c.reason ? [c.reason] : [],
      flags: [],
      score: null,
      custom: true,
    });
  }
  items.sort((a, b) => a.phase - b.phase || b.setupTotal - a.setupTotal);

  const phases: Record<string, PlanPhase> = {};
  for (const it of items) {
    const k = String(it.phase);
    phases[k] = phases[k] || { key: k, ...(catalog.phases?.[k] || { name: "Phase " + k, timing: "" }), items: [], setup: 0, monthly: 0 };
    phases[k].items.push(it);
    phases[k].setup += it.setupTotal;
    phases[k].monthly += it.monthlyTotal;
  }

  const setupGross = items.reduce((t, i) => t + i.setupTotal, 0);
  const discountPct = Number(ov.discountPct ?? S.discountPct ?? 0);
  const discount = Math.round((setupGross * discountPct) / 100);
  const setupNet = setupGross - discount;
  const monthly = items.reduce((t, i) => t + i.monthlyTotal, 0);
  const effortHours = items.reduce((t, i) => t + (Number(i.effortHours) || 0) * (i.id === "proactive" ? 1 : i.qty), 0);
  const internalCost = effortHours * Number(S.internalRate || 0);

  // Budget fit
  const bMax = BUDGET_MAX[s(A, "budget")];
  const mMax = MONTHLY_MAX[s(A, "monthlyBudget")];
  const phase1 = phases["1"] || { setup: 0, monthly: 0 };
  const budget = {
    setupOk: bMax === undefined ? null : setupNet <= bMax,
    monthlyOk: mMax === undefined ? null : monthly <= mMax,
    phase1Ok: bMax === undefined ? null : phase1.setup <= bMax,
  };

  // Impact estimate
  const sumSaved = items.reduce((t, i) => t + (Number(i.hoursSavedPerWeek) || 0), 0);
  const hoursSaved = Math.round((A.hoursLost ? Math.min(sumSaved, h.n("hoursLost")) : sumSaved) * 10) / 10;
  const timeValue = Math.round(hoursSaved * 4.33 * Number(S.clientHourValue || 0));
  let recoveredLeads = 0;
  let extraRevenue = 0;
  const leadTools = ["vw-lead", "vw-auto", "vw-dashboard", "auto-nurture", "vw-quote"];
  if (items.some((i) => leadTools.includes(i.id)) && h.n("leadsPerMonth") > 0) {
    const leak = [0.05, 0.03, 0.07, 0.12, 0.18, 0.25][h.n("lostLeads")] ?? 0.05;
    const slow = h.is("responseTime", "1–2 days", "Longer / inconsistent") ? 0.05 : 0;
    recoveredLeads = Math.round(h.n("leadsPerMonth") * (leak + slow) * 0.5 * 10) / 10;
    extraRevenue = Math.round(recoveredLeads * (Number(S.closeRate || 0) / 100) * h.n("avgCustomerValue"));
  }
  const monthlyValue = timeValue + extraRevenue;
  const paybackMonths = monthlyValue > monthly ? Math.ceil(setupNet / (monthlyValue - monthly)) : null;

  // Ecosystem readiness
  const capIndex = Object.fromEntries((eco?.capabilities || []).map((c) => [c.id, c]));
  const readiness = items.map((it) => {
    const caps = (it.requires || []).map((cid) => ({ id: cid, name: capIndex[cid]?.name || cid, ...capabilityStatus(cid, eco || {}) }));
    const worst: CapStatus = caps.some((c) => c.status === "gap") ? "gap" : caps.some((c) => c.status === "unconfirmed") ? "unconfirmed" : "ready";
    return { id: it.id, name: it.name, caps, status: caps.length ? worst : ("ready" as CapStatus) };
  });

  // Follow-up questions for unanswered essentials
  const essentials: [string, string][] = [
    ["leadsPerMonth", "How many leads come in each month?"],
    ["avgCustomerValue", "What is a new customer worth?"],
    ["hoursLost", "How many hours a week go to admin?"],
    ["budget", "What one-time budget is realistic?"],
    ["monthlyBudget", "What monthly budget is realistic?"],
    ["decisionMaker", "Who signs off on the purchase?"],
    ["sitePlatform", "What is the website built on, and who has the login?"],
    ["timeline", "When do they need this working?"],
  ];
  const openQuestions = essentials
    .filter(([k]) => A[k] === undefined || A[k] === "" || (Array.isArray(A[k]) && !(A[k] as string[]).length))
    .map(([, q]) => q);
  if (A.decisionMaker === "No") openQuestions.push("Book a follow-up with the decision-maker before sending the proposal.");

  return {
    all,
    items,
    phases: Object.values(phases).sort((a, b) => Number(a.key) - Number(b.key)),
    setupGross,
    discountPct,
    discount,
    setupNet,
    monthly,
    effortHours,
    internalCost,
    margin: setupNet - internalCost,
    budget,
    hoursSaved,
    timeValue,
    recoveredLeads,
    extraRevenue,
    monthlyValue,
    paybackMonths,
    readiness,
    openQuestions,
    threshold,
  };
}

const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);

/** Plain-language summary of what we heard (client-facing). */
export function situation(A: Answers): string[] {
  const h = helpers(A);
  const out: string[] = [];
  if (h.n("leadsPerMonth")) {
    const src = ((A.leadSources as string[] | undefined) || [])
      .slice(0, 3)
      .map((x) => x.toLowerCase())
      .join(", ");
    out.push(`About ${h.n("leadsPerMonth")} new leads a month${src ? `, mostly from ${src}` : ""}.`);
  }
  if (A.leadTracking || A.responseTime) {
    const parts: string[] = [];
    const where = ({ "Paper / notebook": "on paper", Spreadsheet: "in a spreadsheet", "Email inbox": "in an email inbox", "A CRM": "in a CRM" } as Record<string, string>)[
      s(A, "leadTracking")
    ];
    if (A.leadTracking) parts.push(A.leadTracking === "Nowhere" ? "leads are not tracked in one place" : `leads are tracked ${where}`);
    if (A.responseTime) parts.push(`new leads usually hear back ${s(A, "responseTime").toLowerCase().replace("longer / inconsistent", "inconsistently")}`);
    out.push(cap(parts.join(", and ")) + ".");
  }
  if (h.yes("takesAppointments") && A.bookingMethod && A.bookingMethod !== "Not applicable")
    out.push(`Appointments are booked by ${s(A, "bookingMethod").toLowerCase()}${h.n("noShows") >= 3 ? ", and no-shows are a recurring cost" : ""}.`);
  if (h.yes("givesQuotes") && A.quoteTime) out.push(`A typical quote takes ${s(A, "quoteTime").toLowerCase()}.`);
  if (A.reviewsAsk)
    out.push(
      `Reviews: ${A.reviewsAsk === "Never" ? "customers are not asked for reviews" : A.reviewsAsk === "Sometimes" ? "customers are sometimes asked for reviews" : "reviews are requested " + s(A, "reviewsAsk").toLowerCase()}${A.googleReviews !== undefined && A.googleReviews !== "" ? ` (about ${A.googleReviews} on Google)` : ""}.`,
    );
  if (h.n("spreadsheetsCount") >= 3) out.push(`${h.n("spreadsheetsCount")} spreadsheets help run day-to-day operations.`);
  if (h.n("hoursLost")) out.push(`Roughly ${h.n("hoursLost")} hours a week go to admin and manual work.`);
  return out;
}

/** Ecosystem coverage: each capability the active catalog needs, with who provides it. */
export function ecoCoverage(catalog: Catalog, eco: Ecosystem) {
  return (eco.capabilities || [])
    .map((c) => {
      const st = capabilityStatus(c.id, eco);
      const modules = (catalog.modules || []).filter((m) => m.active !== false && (m.requires || []).includes(c.id));
      return { ...c, ...st, modules };
    })
    .filter((c) => c.modules.length || c.tools.length);
}
