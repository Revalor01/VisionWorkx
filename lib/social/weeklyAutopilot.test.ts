import { describe, expect, it } from "vitest";
import { brandMediaPolicy } from "./brandMediaPolicy";
import { productOfLink, productPageUrl, productSlot, weeklyProductPlan } from "./weeklyAutopilot";

const kids = brandMediaPolicy("Revalor Kids");
const apps = ["chorebit", "feelflow", "mindbit"];

describe("weeklyProductPlan", () => {
  it("gives every app a Facebook + Instagram post when none went out this week", () => {
    expect(weeklyProductPlan(kids, apps, ["facebook", "instagram", "tiktok"], [])).toEqual([
      { product: "chorebit", platforms: ["facebook", "instagram"] },
      { product: "feelflow", platforms: ["facebook", "instagram"] },
      { product: "mindbit", platforms: ["facebook", "instagram"] },
    ]);
  });
  it("counts each app's posts per platform by its link", () => {
    const recent = [
      { platform: "facebook", link_url: "https://products.revalorllc.com/kids#chorebit" },
      { platform: "instagram", link_url: "https://products.revalorllc.com/kids#chorebit" },
      { platform: "facebook", link_url: "https://products.revalorllc.com/kids#feelflow" },
      { platform: "facebook", link_url: null },
    ];
    expect(weeklyProductPlan(kids, apps, ["facebook", "instagram"], recent)).toEqual([
      { product: "feelflow", platforms: ["instagram"] },
      { product: "mindbit", platforms: ["facebook", "instagram"] },
    ]);
  });
  it("is empty for a brand with no weekly cadence", () => {
    expect(weeklyProductPlan(brandMediaPolicy("Revalor Wellness"), ["sanctum"], ["facebook"], [])).toEqual([]);
  });
});

describe("links", () => {
  it("builds and reads an app's page link", () => {
    expect(productPageUrl("https://products.revalorllc.com/kids", "mindbit")).toBe("https://products.revalorllc.com/kids#mindbit");
    expect(productPageUrl("https://x.com/a#old", "feelflow")).toBe("https://x.com/a#feelflow");
    expect(productPageUrl(null, "feelflow")).toBeNull();
    expect(productOfLink("https://products.revalorllc.com/kids#feelflow", apps)).toBe("feelflow");
    expect(productOfLink("https://products.revalorllc.com/kids#other", apps)).toBeNull();
  });
});

describe("productSlot", () => {
  it("puts each app on its own day: Facebook 14:00, Instagram 17:00 UTC", () => {
    const now = new Date("2026-11-07T13:00:00Z");
    expect(productSlot(0, "facebook", now)).toBe("2026-11-07T14:00:00.000Z");
    expect(productSlot(0, "instagram", now)).toBe("2026-11-07T17:00:00.000Z");
    expect(productSlot(2, "facebook", now)).toBe("2026-11-09T14:00:00.000Z");
  });
  it("starts tomorrow once today's 14:00 has passed", () => {
    expect(productSlot(0, "facebook", new Date("2026-11-07T15:00:00Z"))).toBe("2026-11-08T14:00:00.000Z");
  });
});
