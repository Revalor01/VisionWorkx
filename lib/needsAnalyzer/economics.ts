import type { Plan } from "./rules";
import type { Catalog } from "./types";

// Operator-only economics layer for the Needs Analyzer. It consumes the Plan that
// computePlan already produced plus the catalog settings and derives margin, minimum
// price, and the maximum safe founding-client discount. It does NOT modify computePlan
// or its output, so rules.test.ts and the offline app on Machine B stay untouched.

export const ECON_DEFAULTS = {
  internalRate: 60,
  targetMarginPct: 50,
  platformCostMonthly: 45,
  activeClientApps: 1,
  aiCostMonthly: 8,
  supportHoursMonthly: 1,
  stripePct: 2.9,
  stripeFixed: 0.3,
} as const;

export interface EconSide {
  /** Undiscounted list price for this side. */
  list: number;
  /** Your internal cost to deliver this side. */
  cost: number;
  /** Price after the applied discount. */
  price: number;
  /** price − cost. */
  margin: number;
  /** Rounded margin as a % of price (0 when price is 0). */
  marginPct: number;
  /** Lowest price that still clears the target margin. */
  minPrice: number;
  /** Largest discount (%) off list that still clears the target margin. */
  safeDiscountPct: number;
  /** Discount (%) off list at which margin reaches 0. */
  breakEvenDiscountPct: number;
}

export interface Economics {
  monthly: {
    platformShare: number;
    stripe: number;
    ai: number;
    /** Cash out the door (platform + stripe + ai), excluding your labor. */
    hostingSubtotal: number;
    labor: number;
    /** hostingSubtotal + labor. */
    allInCost: number;
    lines: { key: string; label: string; amount: number }[];
  };
  setup: EconSide;
  monthlySide: EconSide;
  /** The combined discount applied to both sides. */
  discountPct: number;
  combinedSafeDiscountPct: number;
  combinedBreakEvenDiscountPct: number;
  bindingSide: "setup" | "monthly";
  status: "target" | "thin" | "loss";
}

const round = (n: number) => Math.round(n);

export function computeEconomics(
  plan: Plan,
  settings: Catalog["settings"],
  opts?: { discountPct?: number },
): Economics {
  const S = settings || ({} as Catalog["settings"]);
  const internalRate = S.internalRate ?? ECON_DEFAULTS.internalRate;
  const target = (S.targetMarginPct ?? ECON_DEFAULTS.targetMarginPct) / 100;
  const platformCost = S.platformCostMonthly ?? ECON_DEFAULTS.platformCostMonthly;
  const clients = Math.max(1, S.activeClientApps ?? ECON_DEFAULTS.activeClientApps);
  const ai = S.aiCostMonthly ?? ECON_DEFAULTS.aiCostMonthly;
  const supportHours = S.supportHoursMonthly ?? ECON_DEFAULTS.supportHoursMonthly;
  const stripePct = S.stripePct ?? ECON_DEFAULTS.stripePct;
  const stripeFixed = S.stripeFixed ?? ECON_DEFAULTS.stripeFixed;

  const d = opts?.discountPct ?? 0;
  const keep = 1 - d / 100;
  const stripeOn = (p: number) => (p > 0 ? (p * stripePct) / 100 + stripeFixed : 0);

  const platformShare = platformCost / clients;
  const labor = supportHours * internalRate;

  // --- setup side ---
  const setupList = plan.setupGross || 0;
  const setupCost = plan.internalCost || 0;
  const setupPrice = setupList * keep;
  const setupMargin = setupPrice - setupCost;
  const setupMinPrice = setupCost / (1 - target);
  const setup: EconSide = {
    list: setupList,
    cost: setupCost,
    price: setupPrice,
    margin: setupMargin,
    marginPct: setupPrice > 0 ? round((setupMargin / setupPrice) * 100) : 0,
    minPrice: setupMinPrice,
    safeDiscountPct: setupList > 0 ? round((1 - setupMinPrice / setupList) * 100) : 0,
    breakEvenDiscountPct: setupList > 0 ? round((1 - setupCost / setupList) * 100) : 0,
  };

  // --- monthly side (cost includes Stripe, which scales with the discounted price) ---
  const monthlyList = plan.monthly || 0;
  const monthlyFixed = platformShare + ai + labor; // everything but Stripe
  const monthlyPrice = monthlyList * keep;
  const monthlyCost = monthlyFixed + stripeOn(monthlyPrice);
  const monthlyMargin = monthlyPrice - monthlyCost;
  // price*(1 − stripePct/100) − stripeFixed − monthlyFixed = target*price  ⇒ solve for price
  const monthlyMinPrice = (monthlyFixed + stripeFixed) / (1 - stripePct / 100 - target);
  const monthlyBEPrice = (monthlyFixed + stripeFixed) / (1 - stripePct / 100);
  const monthlySide: EconSide = {
    list: monthlyList,
    cost: monthlyCost,
    price: monthlyPrice,
    margin: monthlyMargin,
    marginPct: monthlyPrice > 0 ? round((monthlyMargin / monthlyPrice) * 100) : 0,
    minPrice: monthlyMinPrice,
    safeDiscountPct: monthlyList > 0 ? round((1 - monthlyMinPrice / monthlyList) * 100) : 0,
    breakEvenDiscountPct: monthlyList > 0 ? round((1 - monthlyBEPrice / monthlyList) * 100) : 0,
  };

  // --- breakdown (display uses Stripe on the LIST monthly) ---
  const stripeList = stripeOn(monthlyList);
  const hostingSubtotal = platformShare + ai + stripeList;
  const allInCost = hostingSubtotal + labor;

  // Only a side that actually carries revenue constrains the discount. A zero-revenue
  // side (setup-only deal, monthly-only deal, or an empty assessment) would otherwise
  // force its floors to 0 and flag every discount as a "loss".
  const sides: { name: "setup" | "monthly"; side: EconSide }[] = [];
  if (setupList > 0) sides.push({ name: "setup", side: setup });
  if (monthlyList > 0) sides.push({ name: "monthly", side: monthlySide });

  let combinedSafeDiscountPct = 100;
  let combinedBreakEvenDiscountPct = 100;
  let bindingSide: "setup" | "monthly" = "setup";
  if (sides.length) {
    const binding = sides.reduce((a, b) => (b.side.safeDiscountPct < a.side.safeDiscountPct ? b : a));
    combinedSafeDiscountPct = binding.side.safeDiscountPct;
    combinedBreakEvenDiscountPct = Math.min(...sides.map((s) => s.side.breakEvenDiscountPct));
    bindingSide = binding.name;
  }
  const status: Economics["status"] = d > combinedBreakEvenDiscountPct ? "loss" : d > combinedSafeDiscountPct ? "thin" : "target";

  return {
    monthly: {
      platformShare,
      stripe: stripeList,
      ai,
      hostingSubtotal,
      labor,
      allInCost,
      lines: [
        { key: "platform", label: "Shared platform share", amount: platformShare },
        { key: "stripe", label: "Stripe", amount: stripeList },
        { key: "ai", label: "Claude API", amount: ai },
        { key: "labor", label: "Support time", amount: labor },
      ],
    },
    setup,
    monthlySide,
    discountPct: d,
    combinedSafeDiscountPct,
    combinedBreakEvenDiscountPct,
    bindingSide,
    status,
  };
}
