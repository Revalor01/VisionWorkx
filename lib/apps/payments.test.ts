import { describe, it, expect } from "vitest";
import { buildCartLineItems, platformFeePercent } from "./payments";

describe("buildCartLineItems", () => {
  it("builds one Stripe line item per cart entry with the total", () => {
    const { lineItems, totalCents } = buildCartLineItems(
      [
        { name: "Candle — Vanilla", amountCents: 1800, quantity: 2 },
        { name: "Candle — Cedar", amountCents: 2000, quantity: 1 },
      ],
      "usd",
    );
    expect(lineItems).toHaveLength(2);
    expect(lineItems[0]).toMatchObject({
      quantity: 2,
      price_data: { currency: "usd", unit_amount: 1800, product_data: { name: "Candle — Vanilla" } },
    });
    expect(totalCents).toBe(1800 * 2 + 2000);
  });

  it("attaches an https image, drops a non-https one", () => {
    const { lineItems } = buildCartLineItems(
      [
        { name: "A", amountCents: 500, quantity: 1, imageUrl: "https://x/a.png" },
        { name: "B", amountCents: 500, quantity: 1, imageUrl: "http://x/b.png" },
      ],
      "usd",
    );
    expect((lineItems[0].price_data as { product_data: { images?: string[] } }).product_data.images).toEqual([
      "https://x/a.png",
    ]);
    expect((lineItems[1].price_data as { product_data: { images?: string[] } }).product_data.images).toBeUndefined();
  });

  it("clamps quantity to 1..999 and drops non-positive amounts", () => {
    const { lineItems, totalCents } = buildCartLineItems(
      [
        { name: "neg", amountCents: -100, quantity: 1 },
        { name: "zero qty", amountCents: 300, quantity: 0 },
        { name: "huge qty", amountCents: 100, quantity: 100000 },
      ],
      "usd",
    );
    expect(lineItems).toHaveLength(2); // the negative-amount row is dropped
    expect(lineItems.find((l) => (l.price_data as { product_data: { name: string } }).product_data.name === "zero qty")?.quantity).toBe(1);
    expect(lineItems.find((l) => (l.price_data as { product_data: { name: string } }).product_data.name === "huge qty")?.quantity).toBe(999);
    expect(totalCents).toBe(300 * 1 + 100 * 999);
  });

  it("caps at Stripe's 100 line items", () => {
    const items = Array.from({ length: 150 }, (_, i) => ({
      name: `p${i}`,
      amountCents: 100,
      quantity: 1,
    }));
    expect(buildCartLineItems(items, "usd").lineItems).toHaveLength(100);
  });
});

describe("platformFeePercent", () => {
  it("reads PLATFORM_FEE_PERCENT, ignoring junk / out-of-range", () => {
    const orig = process.env.PLATFORM_FEE_PERCENT;
    process.env.PLATFORM_FEE_PERCENT = "1.5";
    expect(platformFeePercent()).toBe(1.5);
    process.env.PLATFORM_FEE_PERCENT = "nonsense";
    expect(platformFeePercent()).toBe(0);
    process.env.PLATFORM_FEE_PERCENT = "99";
    expect(platformFeePercent()).toBe(0);
    if (orig === undefined) delete process.env.PLATFORM_FEE_PERCENT;
    else process.env.PLATFORM_FEE_PERCENT = orig;
  });
});
