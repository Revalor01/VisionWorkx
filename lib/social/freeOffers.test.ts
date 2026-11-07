import { describe, expect, it } from "vitest";
import { captionLinkLine, freeOfferFrom, freeOfferInstruction, parseFreeOffers } from "./freeOffers";

describe("freeOfferFrom", () => {
  it("turns a trial into a free trial, keeps one that already says free", () => {
    expect(freeOfferFrom({ trial: "14-day trial" })).toBe("14-day free trial");
    expect(freeOfferFrom({ trial: "30-day free trial" })).toBe("30-day free trial");
  });
  it("finds a $0 tier as a free plan", () => {
    expect(freeOfferFrom({ tiers: [{ name: "Free", monthly: 0, price: "$0" }, { name: "Plus", monthly: 9, price: "$9/mo" }] })).toBe("a free plan (Free, $0)");
  });
  it("is null when there's no free way in", () => {
    expect(freeOfferFrom({ tiers: [{ name: "Pro", monthly: 99, price: "$99/mo" }] })).toBeNull();
    expect(freeOfferFrom({})).toBeNull();
  });
});

describe("parseFreeOffers", () => {
  it("maps the feed to slug → offer for products that have one", () => {
    const body = { products: [
      { slug: "visionworkx", name: "VisionWorkx Modules", trial: "14-day trial", tiers: [] },
      { slug: "sanctum", name: "Sanctum", trial: null, tiers: [{ name: "Free", monthly: 0, price: "$0" }] },
      { slug: "consulting", name: "Consulting", tiers: [{ name: "Project", monthly: 2500, price: "$2,500" }] },
    ] };
    expect(parseFreeOffers(body)).toEqual({
      visionworkx: { name: "VisionWorkx Modules", offer: "14-day free trial" },
      sanctum: { name: "Sanctum", offer: "a free plan (Free, $0)" },
    });
    expect(parseFreeOffers({})).toBeNull();
  });
});

describe("freeOfferInstruction", () => {
  it("lists the offers and requires them in every post", () => {
    const t = freeOfferInstruction([{ name: "Chorebit", offer: "30-day free trial" }]);
    expect(t).toMatch(/every post must invite the reader to try it free/);
    expect(t).toContain("- Chorebit: 30-day free trial");
    expect(freeOfferInstruction([])).toBe("");
  });
});

describe("captionLinkLine", () => {
  it("adds the product page as plain text unless the caption already links Revalor", () => {
    expect(captionLinkLine("https://products.revalorllc.com/wellness#sanctum", "Hello")).toBe("Learn more: products.revalorllc.com/wellness");
    expect(captionLinkLine("https://products.revalorllc.com/", "Hello")).toBe("Learn more: products.revalorllc.com");
    expect(captionLinkLine("https://products.revalorllc.com/kids", "Visit products.revalorllc.com/kids")).toBeNull();
    expect(captionLinkLine(null, "Hello")).toBeNull();
  });
});
