import { describe, expect, it } from "vitest";
import { limitDrift, parseFeed, resolvePrices } from "./pricingFeed";
import { PLAN_LIMITS, PLAN_PRICE } from "./plans";

// Shape of revalor-admin's GET /api/public/pricing/visionworkx (2026-11-04).
const FEED = {
  product: {
    slug: "visionworkx",
    tiers: [
      { name: "Starter", monthly: 49, annual: 470, note: "3 modules, 500 submissions, 1,000 emails, 300 AI chats, 60 AI phone min/mo" },
      { name: "Growth", monthly: 129, annual: 1238, note: "8 modules, 2,500 submissions, 5,000 emails, 1,500 AI chats, 300 AI phone min/mo" },
      { name: "Pro", monthly: 299, annual: 2870, note: "20 modules, 10,000 submissions, 20,000 emails, 5,000 AI chats, 500 AI phone min/mo" },
    ],
  },
  fallback: false,
};

describe("parseFeed", () => {
  it("reads all three tiers", () => {
    const parsed = parseFeed(FEED)!;
    expect(parsed.prices.starter).toEqual({ monthly: 49, annual: 470, label: "Starter" });
    expect(parsed.prices.pro.annual).toBe(2870);
    expect(parsed.notes.growth).toContain("8 modules");
  });

  it("uses a changed feed price", () => {
    const changed = structuredClone(FEED);
    changed.product.tiers[1].monthly = 139;
    expect(parseFeed(changed)!.prices.growth.monthly).toBe(139);
  });

  it.each([
    ["missing body", null],
    ["no product", { error: "Unknown product." }],
    ["missing tier", { product: { tiers: FEED.product.tiers.slice(0, 2) } }],
    ["zero price", { product: { tiers: FEED.product.tiers.map((t) => ({ ...t, monthly: 0 })) } }],
    ["string price", { product: { tiers: FEED.product.tiers.map((t) => ({ ...t, annual: "470" })) } }],
    ["fractional price", { product: { tiers: FEED.product.tiers.map((t) => ({ ...t, monthly: 49.99 })) } }],
    ["absurd price", { product: { tiers: FEED.product.tiers.map((t) => ({ ...t, annual: 1e12 })) } }],
  ])("rejects %s", (_label, body) => {
    expect(parseFeed(body)).toBeNull();
  });
});

describe("resolvePrices (Stripe guard)", () => {
  it("keeps feed prices when Stripe agrees or is unknown", () => {
    const { prices, mismatches } = resolvePrices(PLAN_PRICE, { "starter:monthly": 49, "pro:annual": 2870 });
    expect(prices).toEqual(PLAN_PRICE);
    expect(mismatches).toEqual([]);
  });

  it("shows what Stripe charges when it differs", () => {
    const { prices, mismatches } = resolvePrices(PLAN_PRICE, { "starter:monthly": 59 });
    expect(prices.starter.monthly).toBe(59);
    expect(prices.starter.annual).toBe(470);
    expect(mismatches).toEqual(["starter monthly: shown $49, Stripe charges $59"]);
  });
});

describe("limitDrift", () => {
  it("finds no drift between the live feed notes and enforced limits", () => {
    const parsed = parseFeed(FEED)!;
    for (const plan of ["starter", "growth", "pro"] as const) expect(limitDrift(plan, parsed.notes[plan]!)).toEqual([]);
  });

  it("reports a differing limit", () => {
    expect(limitDrift("starter", "4 modules, 500 submissions", PLAN_LIMITS.starter)).toEqual([
      "starter modules: feed says 4, code enforces 3",
    ]);
  });
});
