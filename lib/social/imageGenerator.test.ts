import { describe, expect, it } from "vitest";
import { buildContentImagePrompt } from "./imageGenerator";

const base = { brandVoiceNotes: null, hook: "A hook", caption: "A caption", platform: "instagram" as const };

describe("buildContentImagePrompt", () => {
  it("kids: a wholesome real-life scene with no screens, logos or text (garbled text fails the child-safety check)", () => {
    const p = buildContentImagePrompt({ ...base, brandName: "Revalor Kids" });
    expect(p).toMatch(/wholesome/i);
    expect(p).toMatch(/12 and under/);
    expect(p).toMatch(/NO phones, tablets, screens/);
    expect(p).not.toMatch(/mobile app/i);
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
