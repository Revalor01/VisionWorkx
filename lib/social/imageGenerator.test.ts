import { describe, expect, it } from "vitest";
import { buildContentImagePrompt } from "./imageGenerator";

const base = { brandVoiceNotes: null, hook: "A hook", caption: "A caption", platform: "instagram" as const };

describe("buildContentImagePrompt", () => {
  it("kids: wholesome, on-brand, product-grounded, no text", () => {
    const p = buildContentImagePrompt({ ...base, brandName: "Revalor Kids" });
    expect(p).toMatch(/kids and families|wholesome/i);
    expect(p).toMatch(/Chorebit|FeelFlow|MindBit/);
    expect(p).toMatch(/products\.revalorllc\.com/i);
    expect(p).toMatch(/do not render any text/i);
  });

  it("wellness: calm app, no pills/medical, grounded in Sanctum", () => {
    const p = buildContentImagePrompt({ ...base, brandName: "Revalor Wellness" });
    expect(p).toMatch(/mindfulness|mental-health/i);
    expect(p).toMatch(/do not show pills/i);
    expect(p).toMatch(/Sanctum/);
  });

  it("software: the default brand graphic", () => {
    expect(buildContentImagePrompt({ ...base, brandName: "VisionWorkx" })).toMatch(/VisionWorkx/);
  });
});
