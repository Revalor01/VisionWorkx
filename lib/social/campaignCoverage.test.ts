import { describe, expect, it } from "vitest";
import { brandCoverage, coveredProducts, renaissanceSlug, type LiveMandate } from "./campaignCoverage";

const now = new Date("2026-11-10T12:00:00Z");
const m = (o: Partial<LiveMandate> = {}): LiveMandate => ({ status: "active", starts_at: "2026-11-01T00:00:00Z", ends_at: "2026-12-01T00:00:00Z", limits: { social: { posts_per_week: 3 } }, product_slugs: ["elevate"], ...o });

describe("coveredProducts", () => {
  it("collects products of live permissions that include Social", () => {
    expect([...coveredProducts([m(), m({ product_slugs: ["visionworkx"] })], now)].sort()).toEqual(["elevate", "visionworkx"]);
  });
  it("ignores paused, not-started, ended and social-less permissions", () => {
    expect(coveredProducts([
      m({ status: "paused" }),
      m({ starts_at: "2026-11-20T00:00:00Z" }),
      m({ ends_at: "2026-11-10T12:00:00Z" }),
      m({ limits: { email: {} } as LiveMandate["limits"] }),
    ], now).size).toBe(0);
  });
});

describe("brandCoverage", () => {
  it("skips a brand whose every product is covered", () => {
    expect(brandCoverage("VisionWorkx", new Set(["visionworkx"]))).toEqual({ skip: true, exclude: ["visionworkx"] });
  });
  it("keeps a brand running but drops its covered products", () => {
    expect(brandCoverage("Revalor LLC", new Set(["visionworkx", "consulting"]))).toEqual({ skip: false, exclude: ["visionworkx", "revalor_consulting"] });
  });
  it("a product the brand doesn't list doesn't stop it (it's only told to avoid it)", () => {
    expect(brandCoverage("Revalor Wellness", new Set(["elevate"]))).toEqual({ skip: false, exclude: [] });
  });
  it("never skips a brand with no product mapping", () => {
    expect(brandCoverage("Unknown", new Set(["elevate"]))).toEqual({ skip: false, exclude: [] });
  });
  it("maps Social's consulting key to Renaissance's slug", () => {
    expect(renaissanceSlug("revalor_consulting")).toBe("consulting");
    expect(renaissanceSlug("sanctum")).toBe("sanctum");
  });
});
