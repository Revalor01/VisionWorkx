import { describe, expect, it } from "vitest";
import { brandMediaPolicy, isKidsBrand, maxVideosForHorizon } from "./brandMediaPolicy";
import { buildContentVideoPrompt } from "./videoGenerator";

describe("brandMediaPolicy", () => {
  it("makes Revalor Kids image-first, kids-styled, ~1 video/week", () => {
    expect(brandMediaPolicy("Revalor Kids")).toEqual({ audience: "kids", videoStyle: "kids", imageFirst: true, maxVideosPerWeek: 1 });
    expect(isKidsBrand("Revalor Kids")).toBe(true);
  });

  it("styles Revalor Wellness as wellness (Sanctum), video allowed", () => {
    const p = brandMediaPolicy("Revalor Wellness");
    expect(p.videoStyle).toBe("wellness");
    expect(p.audience).toBe("business");
    expect(isKidsBrand("Revalor Wellness")).toBe(false);
  });

  it("defaults other brands to the software style", () => {
    expect(brandMediaPolicy("VisionWorkx").videoStyle).toBe("software");
    expect(brandMediaPolicy("Revalor LLC").videoStyle).toBe("software");
  });

  it("caps hero videos per horizon for kids, unlimited otherwise", () => {
    expect(maxVideosForHorizon("Revalor Kids", 7)).toBe(1);
    expect(maxVideosForHorizon("Revalor Kids", 14)).toBe(2);
    expect(maxVideosForHorizon("Revalor Kids", 15)).toBe(3);
    expect(maxVideosForHorizon("Revalor LLC", 15)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("buildContentVideoPrompt", () => {
  const base = { brandVoiceNotes: null, hook: "A good hook", caption: "A caption" };

  it("kids: family-friendly, never software/laptop/other brands", () => {
    const p = buildContentVideoPrompt({ ...base, brandName: "Revalor Kids" });
    expect(p).toMatch(/kids and families|family-friendly/i);
    expect(p).not.toMatch(/software app/i); // never framed as business software
    expect(p).not.toMatch(/visionworkx/i);
    expect(p).toMatch(/only about Revalor Kids|do not show corporate/i); // excludes other brands/products
  });

  it("wellness: a calming mindfulness app, explicitly no pills/supplements", () => {
    const p = buildContentVideoPrompt({ ...base, brandName: "Revalor Wellness" });
    expect(p).toMatch(/mindfulness|mental-health/i);
    expect(p).toMatch(/do not show pills/i);
    expect(p).not.toMatch(/software app/i);
  });

  it("software: the default business framing", () => {
    expect(buildContentVideoPrompt({ ...base, brandName: "VisionWorkx" })).toMatch(/software app/i);
  });

  it("every template forbids on-screen text", () => {
    for (const brandName of ["Revalor Kids", "Revalor Wellness", "VisionWorkx"]) {
      expect(buildContentVideoPrompt({ ...base, brandName })).toMatch(/do not render any text/i);
    }
  });

  it("every template guides the Revalor pronunciation (re-VAL-or, not REV-a-lor)", () => {
    for (const brandName of ["Revalor Kids", "Revalor Wellness", "VisionWorkx"]) {
      const p = buildContentVideoPrompt({ ...base, brandName });
      expect(p).toMatch(/re-VAL-or/);
      expect(p).toMatch(/never "REV-a-lor"/);
    }
  });

  it("grounds the prompt in the brand's real products (products.revalorllc.com)", () => {
    const kids = buildContentVideoPrompt({ ...base, brandName: "Revalor Kids" });
    expect(kids).toMatch(/products\.revalorllc\.com/i);
    expect(kids).toMatch(/Chorebit|FeelFlow|MindBit/);
    expect(buildContentVideoPrompt({ ...base, brandName: "Revalor Wellness" })).toMatch(/Sanctum/);
    expect(buildContentVideoPrompt({ ...base, brandName: "VisionWorkx" })).toMatch(/VisionWorkx/);
  });
});
