import { describe, it, expect } from "vitest";
import { computeEconomics } from "./economics";
import type { Plan } from "./rules";
import type { Catalog } from "./types";

// Minimal stub: computeEconomics only reads setupGross, internalCost, monthly.
const plan = { setupGross: 5250, internalCost: 2100, monthly: 248 } as unknown as Plan;

const settings = {
  internalRate: 60,
  platformCostMonthly: 45,
  activeClientApps: 5,
  aiCostMonthly: 8,
  supportHoursMonthly: 1,
  targetMarginPct: 50,
  stripePct: 2.9,
  stripeFixed: 0.3,
} as unknown as Catalog["settings"];

describe("computeEconomics", () => {
  const e = computeEconomics(plan, settings, { discountPct: 15 });

  it("breaks monthly cost into providers", () => {
    expect(e.monthly.platformShare).toBeCloseTo(9, 2);
    expect(e.monthly.stripe).toBeCloseTo(7.49, 2);
    expect(e.monthly.hostingSubtotal).toBeCloseTo(24.49, 2);
    expect(e.monthly.labor).toBeCloseTo(60, 2);
    expect(e.monthly.allInCost).toBeCloseTo(84.49, 2);
  });

  it("computes setup margin and floor", () => {
    expect(e.setup.marginPct).toBe(53);
    expect(e.setup.minPrice).toBeCloseTo(4200, 2);
    expect(e.setup.safeDiscountPct).toBe(20);
    expect(e.setup.breakEvenDiscountPct).toBe(60);
  });

  it("computes monthly margin and floor", () => {
    expect(e.monthlySide.marginPct).toBe(60);
    expect(e.monthlySide.safeDiscountPct).toBe(34);
    expect(e.monthlySide.breakEvenDiscountPct).toBe(68);
  });

  it("names the binding side and status", () => {
    expect(e.combinedSafeDiscountPct).toBe(20);
    expect(e.combinedBreakEvenDiscountPct).toBe(60);
    expect(e.bindingSide).toBe("setup");
    expect(e.status).toBe("target"); // 15% <= safe 20%
  });

  it("clamps activeClientApps to 1 when 0/blank", () => {
    const z = computeEconomics(plan, { ...settings, activeClientApps: 0 }, { discountPct: 0 });
    expect(z.monthly.platformShare).toBeCloseTo(45, 2);
  });

  it("handles zero monthly and missing fields without NaN", () => {
    const zero = computeEconomics({ ...plan, monthly: 0 } as unknown as Plan, {} as unknown as Catalog["settings"], { discountPct: 0 });
    expect(Number.isFinite(zero.monthlySide.marginPct)).toBe(true);
  });

  it("reports loss past break-even", () => {
    const loss = computeEconomics(plan, settings, { discountPct: 65 });
    expect(loss.status).toBe("loss");
    expect(loss.setup.margin).toBeLessThan(0);
  });
});
