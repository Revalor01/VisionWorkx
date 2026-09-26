import { describe, expect, it } from "vitest";
import {
  computeEstimate,
  DEFAULT_QUOTE,
  defaultAnswers,
  normalizeAnswers,
  parseQuotePricing,
  quoteFieldDefs,
  quoteValues,
  type QuotePricing,
} from "./quote";

const simple: QuotePricing = parseQuotePricing({
  basePriceCents: 10000,
  inputs: [
    { kind: "counter", id: "rooms", label: "Rooms", min: 1, max: 5, default: 2, pricePerUnitCents: 2000 },
    { kind: "choice", id: "tier", label: "Level", options: [{ label: "Basic", priceCents: 0 }, { label: "Deep", priceCents: 5000 }] },
    { kind: "addons", id: "extras", label: "Extras", options: [{ label: "Oven", priceCents: 3000 }, { label: "Fridge", priceCents: 2500 }] },
  ],
  frequency: { label: "How often?", options: [{ label: "Once", discountPct: 0 }, { label: "Weekly", discountPct: 20 }] },
  rangeLowPct: 0,
  rangeHighPct: 0,
  roundToDollars: 1,
  unitLabel: "per visit",
});

describe("computeEstimate", () => {
  it("adds base, counters, choices and add-ons", () => {
    // 100 + 2*20 + 50 + 30 + 25 = 245
    const e = computeEstimate(simple, { rooms: 2, tier: 1, extras: [0, 1], __frequency: 0 });
    expect(e.subtotalCents).toBe(24500);
    expect(e.text).toBe("$245 per visit");
  });

  it("applies the frequency discount", () => {
    const e = computeEstimate(simple, { rooms: 2, tier: 0, extras: [], __frequency: 1 }); // 140 * 0.8
    expect(e.subtotalCents).toBe(11200);
  });

  it("widens and rounds the range", () => {
    const p = { ...simple, rangeLowPct: 8, rangeHighPct: 12, roundToDollars: 5 };
    const e = computeEstimate(p, { rooms: 2, tier: 0, extras: [], __frequency: 0 }); // 140 -> 128.8..156.8
    expect([e.lowCents, e.highCents]).toEqual([13000, 15500]);
    expect(e.text).toBe("$130 – $155 per visit");
  });

  it("never goes below the minimum", () => {
    const p = { ...simple, basePriceCents: 0, minimumCents: 20000 };
    const e = computeEstimate(p, { rooms: 1, tier: 0, extras: [], __frequency: 1 });
    expect(e.lowCents).toBeGreaterThanOrEqual(20000);
  });

  it("charges sliders only above the included amount, with fractional-cent unit prices", () => {
    const p = parseQuotePricing({
      basePriceCents: 9000,
      inputs: [{ kind: "slider", id: "size", label: "Size", min: 500, max: 5000, step: 100, default: 1800, unit: "sq ft", included: 1000, pricePerUnitCents: 4.4 }],
      rangeLowPct: 0,
      rangeHighPct: 0,
      roundToDollars: 1,
    });
    expect(computeEstimate(p, { size: 800 }).subtotalCents).toBe(9000);
    expect(computeEstimate(p, { size: 1800 }).subtotalCents).toBe(9000 + 3520);
  });

  it("matches the preview page's example range for the default calculator", () => {
    const e = computeEstimate(DEFAULT_QUOTE, defaultAnswers(DEFAULT_QUOTE));
    expect(e.text).toMatch(/^\$\d+ – \$\d+ per visit$/);
    expect(e.lowCents).toBeLessThan(e.highCents);
  });
});

describe("normalizeAnswers (visitor input is never trusted)", () => {
  it("clamps, snaps and drops junk", () => {
    const p = parseQuotePricing({
      inputs: [
        { kind: "slider", id: "size", label: "Size", min: 0, max: 1000, step: 50, default: 100, pricePerUnitCents: 1 },
        ...simple.inputs,
      ],
      frequency: simple.frequency,
    });
    const a = normalizeAnswers(p, { size: 999999, rooms: -4, tier: 7, extras: [1, 1, 9, "x", -1], __frequency: 3, evil: 1, price: 1 });
    expect(a).toEqual({ size: 1000, rooms: 1, tier: 1, extras: [1], __frequency: 1 });
    expect(normalizeAnswers(p, { size: 73 }).size).toBe(50);
  });

  it("defaults everything for garbage input", () => {
    expect(normalizeAnswers(simple, "nope")).toEqual(defaultAnswers(simple));
    expect(normalizeAnswers(simple, [1, 2])).toEqual(defaultAnswers(simple));
  });
});

describe("parseQuotePricing", () => {
  it("drops invalid inputs and fixes ids", () => {
    const p = parseQuotePricing({
      basePriceCents: -50,
      inputs: [
        { kind: "choice", label: "Needs two options", options: [{ label: "Only one", priceCents: 1 }] },
        { kind: "counter", id: "Bad Id!", label: "Floors", min: 1, max: 3 },
        { kind: "counter", id: "floors", label: "Floors again", min: 1, max: 3 },
        { kind: "mystery", label: "?" },
      ],
      roundToDollars: 7,
      rangeHighPct: 500,
    });
    expect(p.basePriceCents).toBe(0);
    expect(p.inputs.map((i) => i.id)).toEqual(["floors", "floors_again"]);
    expect(p.roundToDollars).toBe(5);
    expect(p.rangeHighPct).toBe(100);
  });
});

describe("quoteValues", () => {
  it("produces readable labelled answers for the dashboard and emails", () => {
    const answers = { rooms: 3, tier: 1, extras: [1], __frequency: 1 };
    const v = quoteValues(simple, answers, computeEstimate(simple, answers));
    expect(v).toEqual({ qc_estimate: "$188 per visit", qc_rooms: "3", qc_tier: "Deep", qc_extras: "Fridge", qc_frequency: "Weekly" });
    expect(quoteFieldDefs(simple).map((f) => f.id)).toEqual(Object.keys(v));
  });
});
