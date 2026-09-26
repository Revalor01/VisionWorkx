import { describe, expect, it } from "vitest";
import { quoteConfigFromDraft, type RawQuoteDraft } from "./quoteFromPrompt";
import { computeEstimate, defaultAnswers } from "./quote";

const draft: RawQuoteDraft = {
  title: "Instant cleaning estimate",
  intro: "See your price in seconds.",
  submit_label: "Send me the exact quote",
  success_message: "Thanks!",
  unit_label: "per visit",
  base_price: 90,
  minimum_price: 0,
  inputs: [
    { kind: "slider", label: "Home size", unit: "sq ft", min: 500, max: 5000, step: 100, default: 1800, included: 1000, price_per_unit: 0.044, options: [] },
    { kind: "counter", label: "Bedrooms", unit: "", min: 0, max: 8, step: 1, default: 3, included: 0, price_per_unit: 12, options: [] },
    { kind: "addons", label: "Add-ons", unit: "", min: 0, max: 0, step: 0, default: 0, included: 0, price_per_unit: 0, options: [{ label: "Inside oven", price: 30 }] },
  ],
  frequency_options: [
    { label: "One-time", discount_pct: 0 },
    { label: "Weekly", discount_pct: 15 },
  ],
  range_low_pct: 8,
  range_high_pct: 12,
  contact_fields: [
    { id: "name", label: "Your name (required)", type: "text", required: true, options: [] },
    { id: "zip", label: "ZIP code", type: "text", required: false, options: [] },
  ],
};

describe("quoteConfigFromDraft", () => {
  it("converts dollars to cents and keeps the model's structure", () => {
    const c = quoteConfigFromDraft(draft);
    expect(c.quote.basePriceCents).toBe(9000);
    expect(quoteConfigFromDraft({ ...draft, minimum_price: 35 }).quote.minimumCents).toBe(3500);
    expect(c.quote.inputs[0]).toMatchObject({ kind: "slider", pricePerUnitCents: 4.4, included: 1000 });
    expect(c.quote.inputs[1]).toMatchObject({ kind: "counter", pricePerUnitCents: 1200 });
    expect(c.quote.inputs[2]).toMatchObject({ kind: "addons", options: [{ label: "Inside oven", priceCents: 3000 }] });
    expect(c.quote.frequency?.options[1]).toEqual({ label: "Weekly", discountPct: 15 });
    expect(c.payment).toBeNull();
  });

  it("always keeps a way to reply and cleans labels", () => {
    const c = quoteConfigFromDraft(draft);
    expect(c.fields.some((f) => f.type === "email")).toBe(true);
    expect(c.fields[0].label).toBe("Your name");
  });

  it("produces a working estimate", () => {
    const c = quoteConfigFromDraft(draft);
    // 90 + 800*0.044 + 3*12 = 161.20 -> 148.30..180.54 -> $150 – $180
    expect(computeEstimate(c.quote, defaultAnswers(c.quote)).text).toBe("$150 – $180 per visit");
  });
});
