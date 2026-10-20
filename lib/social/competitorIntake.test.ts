import { describe, expect, it } from "vitest";
import {
  brandNameForProduct,
  flagCompetitorMention,
  planCompetitorImport,
  COMPETITOR_FALLBACK_BRAND,
  type CompetitorPostIdea,
} from "./competitorIntake";
import { BRAND_PRODUCTS } from "./productKnowledge";

describe("brandNameForProduct", () => {
  it("maps each product to its grouped brand", () => {
    expect(brandNameForProduct("visionworkx")).toBe("VisionWorkx");
    expect(brandNameForProduct("proactive")).toBe("Revalor LLC");
    expect(brandNameForProduct("sanctum")).toBe("Revalor Wellness");
    expect(brandNameForProduct("chorebit")).toBe("Revalor Kids");
    expect(brandNameForProduct("feelflow")).toBe("Revalor Kids");
    expect(brandNameForProduct("mindbit")).toBe("Revalor Kids");
  });

  it("maps tessa to Wellness alongside Sanctum", () => {
    expect(brandNameForProduct("tessa")).toBe("Revalor Wellness");
  });

  it("falls back to the company brand for anything unknown", () => {
    expect(brandNameForProduct("revalor_consulting")).toBe(COMPETITOR_FALLBACK_BRAND);
    expect(brandNameForProduct("")).toBe(COMPETITOR_FALLBACK_BRAND);
  });

  // Drift guard: PRODUCT_TO_BRAND_NAME is maintained by hand next to
  // productKnowledge.ts's BRAND_PRODUCTS. If a product is later added to a
  // brand there (e.g. a new Kids app) but not mapped here, it would fall back
  // to the company brand and land in the wrong brand — so assert every product
  // BRAND_PRODUCTS carries resolves (directly or by fallback) to a brand that
  // actually carries it.
  it("maps every BRAND_PRODUCTS product to a brand that carries it", () => {
    for (const product of Object.values(BRAND_PRODUCTS).flat()) {
      const brand = brandNameForProduct(product);
      expect(BRAND_PRODUCTS[brand] ?? [], `product "${product}" -> brand "${brand}"`).toContain(product);
    }
  });
});

describe("flagCompetitorMention", () => {
  it("flags a tracked competitor named in the copy, case-insensitively", () => {
    expect(flagCompetitorMention("Why Headspace fans are switching", ["Headspace", "Calm"])).toBe("Headspace");
    expect(flagCompetitorMention("cheaper than headspace", ["Headspace"])).toBe("Headspace");
  });

  it("matches on word boundaries only", () => {
    expect(flagCompetitorMention("the becalmed sea", ["Calm"])).toBeNull();
    expect(flagCompetitorMention("stay Calm out there", ["Calm"])).toBe("Calm");
  });

  it("returns every distinct match joined", () => {
    expect(flagCompetitorMention("Calm vs Headspace vs Calm", ["Calm", "Headspace"])).toBe("Calm, Headspace");
  });

  it("returns null when nothing matches or no names are tracked", () => {
    expect(flagCompetitorMention("a generic post", ["Headspace"])).toBeNull();
    expect(flagCompetitorMention("a generic post", [])).toBeNull();
  });

  it("ignores blank tracked names", () => {
    expect(flagCompetitorMention("anything", ["  ", ""])).toBeNull();
  });

  it("matches names edged by non-word characters", () => {
    expect(flagCompetitorMention("built on .NET today", [".NET"])).toBe(".NET");
    expect(flagCompetitorMention("we love C++ here", ["C++"])).toBe("C++");
    expect(flagCompetitorMention("stay Calm! out there", ["Calm!"])).toBe("Calm!");
  });

  it("still requires a boundary on the word-char side", () => {
    // ".NET" starts with a non-word char, so its left side has no boundary
    // requirement, but the right side ('T') still must not run into a word char.
    expect(flagCompetitorMention("dotNETcore", [".NET"])).toBeNull();
  });
});

const idea = (over: Partial<CompetitorPostIdea>): CompetitorPostIdea => ({
  id: "idea-1",
  product: "sanctum",
  hook: "A calmer morning",
  angle: "Three ways to reset before the day starts.",
  suggested_platform: "instagram",
  ...over,
});

describe("planCompetitorImport", () => {
  const brands = new Map([
    ["VisionWorkx", "b-vw"],
    ["Revalor Wellness", "b-well"],
    ["Revalor Kids", "b-kids"],
    ["Revalor LLC", "b-llc"],
  ]);

  it("builds a manual-approval draft in the mapped brand, dial bypassed", () => {
    const { inserts, skipped } = planCompetitorImport([idea({})], brands, new Map());
    expect(skipped).toEqual([]);
    expect(inserts).toHaveLength(1);
    expect(inserts[0].payload).toMatchObject({
      brand_id: "b-well",
      platform: "instagram",
      hook: "A calmer morning",
      caption: "Three ways to reset before the day starts.",
      status: "draft",
      generated_by: "autonomous",
      source: "competitor_watch",
      source_idea_id: "idea-1",
      competitor_flag: null,
    });
  });

  it("sets competitor_flag when the copy names that product's tracked competitor", () => {
    const names = new Map([["sanctum", ["Headspace", "Calm"]]]);
    const { inserts } = planCompetitorImport(
      [idea({ angle: "A better alternative to Headspace." })],
      brands,
      names
    );
    expect(inserts[0].payload.competitor_flag).toBe("Headspace");
  });

  it("maps kids products to the Revalor Kids brand", () => {
    const { inserts } = planCompetitorImport([idea({ id: "i2", product: "chorebit" })], brands, new Map());
    expect(inserts[0].payload.brand_id).toBe("b-kids");
  });

  it("skips an idea whose brand row is missing instead of dropping it", () => {
    const sparse = new Map([["VisionWorkx", "b-vw"]]);
    const { inserts, skipped } = planCompetitorImport([idea({})], sparse, new Map());
    expect(inserts).toEqual([]);
    expect(skipped).toEqual([
      { ideaId: "idea-1", product: "sanctum", reason: 'No social_brands row named "Revalor Wellness"' },
    ]);
  });

  it("falls back to Revalor LLC for an unmapped product", () => {
    const { inserts } = planCompetitorImport([idea({ id: "i3", product: "mystery" })], brands, new Map());
    expect(inserts[0].payload.brand_id).toBe("b-llc");
  });
});
