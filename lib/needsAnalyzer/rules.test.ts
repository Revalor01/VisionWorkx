import { describe, expect, it } from "vitest";
import { DEFAULT_CATALOG, DEFAULT_ECOSYSTEM } from "./defaults";
import demo from "./demo-plumbing.json";
import { assessmentPath, sectionsForPath } from "./questions";
import { computeApparelPlan, computePlan, situation } from "./rules";
import type { Answers } from "./types";

// Expected values were produced by the offline app's own public/rules.js on the same
// sample assessment and default catalog/ecosystem. If this fails, the two apps would
// recommend different plans for the same client -- fix the port, not the numbers.
const EXPECTED = {
  "summary": {
    "setupGross": 23850,
    "discountPct": 0,
    "discount": 0,
    "setupNet": 23850,
    "monthly": 814,
    "effortHours": 342,
    "internalCost": 20520,
    "margin": 3330,
    "budget": {
      "setupOk": false,
      "monthlyOk": false,
      "phase1Ok": true
    },
    "hoursSaved": 12,
    "timeValue": 1819,
    "recoveredLeads": 6.9,
    "extraRevenue": 1121,
    "monthlyValue": 2940,
    "paybackMonths": 12,
    "openQuestions": [],
    "threshold": 45
  },
  "items": [
    [
      "svc-site",
      1,
      1500,
      0
    ],
    [
      "vw-booking",
      1,
      600,
      39
    ],
    [
      "vw-lead",
      1,
      400,
      29
    ],
    [
      "auto-reviews",
      1,
      300,
      19
    ],
    [
      "vw-auto",
      1,
      0,
      0
    ],
    [
      "cb-spreadsheet",
      1,
      2000,
      49
    ],
    [
      "cb-integration",
      1,
      1500,
      49
    ],
    [
      "cb-invoicing",
      1,
      1200,
      39
    ],
    [
      "auto-nurture",
      1,
      600,
      39
    ],
    [
      "vw-dashboard",
      1,
      500,
      29
    ],
    [
      "auto-referral",
      1,
      500,
      29
    ],
    [
      "proactive",
      2,
      0,
      58
    ],
    [
      "cb-unique",
      1,
      5000,
      99
    ],
    [
      "cb-jobs",
      1,
      3500,
      79
    ],
    [
      "cb-quote-engine",
      1,
      3000,
      49
    ],
    [
      "cb-staff",
      1,
      2500,
      59
    ],
    [
      "svc-discovery",
      1,
      750,
      0
    ],
    [
      "svc-maint",
      1,
      0,
      149
    ]
  ],
  "scores": {
    "vw-lead": 55,
    "vw-booking": 85,
    "vw-quote": 20,
    "vw-intake": 10,
    "vw-auto": 0,
    "vw-dashboard": 75,
    "auto-reminders": 40,
    "auto-reviews": 85,
    "auto-referral": 60,
    "auto-nurture": 60,
    "proactive": 55,
    "cb-invoicing": 90,
    "cb-integration": 45,
    "cb-spreadsheet": 60,
    "cb-reporting": 0,
    "cb-jobs": 70,
    "cb-staff": 60,
    "cb-inventory": 0,
    "cb-quote-engine": 70,
    "cb-portal": 0,
    "cb-unique": 60,
    "svc-site": 55,
    "svc-discovery": 0,
    "svc-maint": 0
  },
  "readiness": [
    [
      "svc-site",
      "gap"
    ],
    [
      "vw-booking",
      "gap"
    ],
    [
      "vw-lead",
      "gap"
    ],
    [
      "auto-reviews",
      "gap"
    ],
    [
      "vw-auto",
      "gap"
    ],
    [
      "cb-spreadsheet",
      "unconfirmed"
    ],
    [
      "cb-integration",
      "gap"
    ],
    [
      "cb-invoicing",
      "gap"
    ],
    [
      "auto-nurture",
      "gap"
    ],
    [
      "vw-dashboard",
      "gap"
    ],
    [
      "auto-referral",
      "gap"
    ],
    [
      "proactive",
      "unconfirmed"
    ],
    [
      "cb-unique",
      "unconfirmed"
    ],
    [
      "cb-jobs",
      "gap"
    ],
    [
      "cb-quote-engine",
      "gap"
    ],
    [
      "cb-staff",
      "gap"
    ],
    [
      "svc-discovery",
      "ready"
    ],
    [
      "svc-maint",
      "gap"
    ]
  ],
  "situation": [
    "About 60 new leads a month, mostly from phone calls, website form, referrals.",
    "Leads are tracked in a spreadsheet, and new leads usually hear back 1–2 days.",
    "Appointments are booked by phone / text, and no-shows are a recurring cost.",
    "A typical quote takes several hours.",
    "Reviews: customers are sometimes asked for reviews (about 18 on Google).",
    "5 spreadsheets help run day-to-day operations.",
    "Roughly 12 hours a week go to admin and manual work."
  ]
};

describe("needs analyzer rules (parity with the offline app)", () => {
  const answers = demo.answers as Answers;
  const plan = computePlan({ answers, overrides: {} }, DEFAULT_CATALOG, DEFAULT_ECOSYSTEM);

  it("scores every module the same", () => {
    expect(Object.fromEntries(plan.all.map((m) => [m.id, m.score]))).toEqual(EXPECTED.scores);
  });

  it("builds the same items, quantities and prices, in the same order", () => {
    expect(plan.items.map((i) => [i.id, i.qty, i.setupTotal, i.monthlyTotal])).toEqual(EXPECTED.items);
  });

  it("gives the same totals, budget fit, impact and open questions", () => {
    const summary = Object.fromEntries(Object.entries(plan).filter(([k]) => !["all", "items", "phases", "readiness"].includes(k)));
    expect(JSON.parse(JSON.stringify(summary))).toEqual(EXPECTED.summary);
  });

  it("gives the same ecosystem readiness and client-facing summary", () => {
    expect(plan.readiness.map((r) => [r.id, r.status])).toEqual(EXPECTED.readiness);
    expect(situation(answers)).toEqual(EXPECTED.situation);
  });

  it("applies overrides: exclusions, price edits, custom items and discount", () => {
    const p = computePlan(
      {
        answers,
        overrides: {
          excluded: ["cb-unique"],
          prices: { "vw-lead": { setup: 250 } },
          custom: [{ id: "custom-x", name: "Van parts log", setup: 1000, monthly: 10, phase: 2 }],
          discountPct: 10,
        },
      },
      DEFAULT_CATALOG,
      DEFAULT_ECOSYSTEM,
    );
    expect(p.items.some((i) => i.id === "cb-unique")).toBe(false);
    expect(p.items.find((i) => i.id === "vw-lead")?.setup).toBe(250);
    expect(p.items.find((i) => i.id === "custom-x")?.phase).toBe(2);
    expect(p.setupGross).toBe(EXPECTED.summary.setupGross - 5000 - 150 + 1000);
    expect(p.discount).toBe(Math.round(p.setupGross * 0.1));
  });

  it("leaves apparel modules out of the standard plan entirely", () => {
    expect(plan.all.some((m) => m.category === "Apparel")).toBe(false);
    expect(plan.items.some((i) => i.id.startsWith("ap-"))).toBe(false);
  });
});

describe("custom apparel path", () => {
  it("reads the path from answers and picks the right sections", () => {
    expect(assessmentPath({})).toBe("standard");
    expect(assessmentPath({ path: "apparel" })).toBe("apparel");
    expect(sectionsForPath("standard")).toBe(sectionsForPath("standard"));
    const ap = sectionsForPath("apparel").map((s) => s.id);
    expect(ap).toContain("business");
    expect(ap).toContain("apparel-decoration");
    expect(ap).toContain("notes");
    expect(sectionsForPath("apparel").some((s) => s.id === "scheduling")).toBe(false);
  });

  it("always returns three tiers, each priced from the Apparel catalog by phase", () => {
    const plan = computeApparelPlan({}, DEFAULT_CATALOG);
    expect(plan.tiers.map((t) => t.tier)).toEqual([1, 2, 3]);
    expect(plan.tiers.every((t) => t.items.length >= 1)).toBe(true);
    const t1 = plan.tiers[0];
    expect(t1.setup).toBe(t1.items.reduce((s, i) => s + i.setup, 0));
    // Phase-1 apparel items in the default catalog: ap-platform + ap-platform-launch.
    expect(t1.setup).toBe(2000);
    expect(plan.tiers[1].monthly).toBe(77);
    expect(plan.tiers[2].setup).toBe(13500);
  });

  it("recommends Tier 1 for a simple, low-volume shop", () => {
    const plan = computeApparelPlan(
      { apDesignerNeed: "None", apPricingComplexity: [], apSuppliers: ["None"], apOrderVolume: 5, apSalesModel: ["Public storefront"], apDecoration: "Outsourced" },
      DEFAULT_CATALOG,
    );
    expect(plan.recommendedTier).toBe(1);
    expect(plan.tiers.find((t) => t.tier === 1)?.recommended).toBe(true);
    expect(plan.tiers.filter((t) => t.recommended)).toHaveLength(1);
    expect(plan.reasons.length).toBeGreaterThan(0);
    expect(plan.clientMustProvide.some((x) => /decorator|print partner/i.test(x))).toBe(true);
    expect(plan.clientMustProvide.some((x) => /artwork/i.test(x))).toBe(true);
  });

  it("recommends Tier 2 for a mid-complexity hybrid", () => {
    const plan = computeApparelPlan(
      { apDesignerNeed: "Logo upload only", apPricingComplexity: ["Quantity tiers", "Print locations"], apSuppliers: ["None"], apOrderVolume: 30, apSalesModel: ["Public storefront"], apDecoration: "Outsourced" },
      DEFAULT_CATALOG,
    );
    expect(plan.recommendedTier).toBe(2);
  });

  it("recommends Tier 3 for a complex, high-volume B2B decorator", () => {
    const plan = computeApparelPlan(
      {
        apDesignerNeed: "Full designer",
        apPricingComplexity: ["Quantity tiers", "Print locations", "Color counts"],
        apSuppliers: ["SanMar", "S&S Activewear"],
        apOrderVolume: 150,
        apSalesModel: ["Repeat B2B", "Team / corporate stores"],
        apDecoration: "In-house",
      },
      DEFAULT_CATALOG,
    );
    expect(plan.recommendedTier).toBe(3);
    expect(plan.clientMustProvide.some((x) => /SanMar/i.test(x))).toBe(true);
    expect(plan.clientMustProvide.some((x) => /pricing rules/i.test(x))).toBe(true);
  });
});
