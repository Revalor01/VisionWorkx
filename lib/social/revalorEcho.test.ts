import { describe, expect, it } from "vitest";
import { echoSlot, shouldEcho } from "@/lib/social/revalorEcho";

describe("shouldEcho", () => {
  it("copies product brands' Facebook posts, never Kids, the Revalor Page itself, other platforms or a copy", () => {
    expect(shouldEcho({ platform: "facebook", echo_of: null }, "Revalor Wellness")).toBe(true);
    expect(shouldEcho({ platform: "facebook", echo_of: null }, "VisionWorkx")).toBe(true);
    expect(shouldEcho({ platform: "facebook", echo_of: null }, "Revalor Kids")).toBe(false);
    expect(shouldEcho({ platform: "facebook", echo_of: null }, "Revalor LLC")).toBe(false);
    expect(shouldEcho({ platform: "instagram", echo_of: null }, "Revalor Wellness")).toBe(false);
    expect(shouldEcho({ platform: "facebook", echo_of: "orig" }, "Revalor Wellness")).toBe(false);
  });
});

describe("echoSlot", () => {
  const posted = new Date("2026-11-08T14:00:20Z");
  it("goes a day later", () => {
    expect(echoSlot(posted, new Set())).toBe("2026-11-09T14:00:00.000Z");
  });
  it("moves to the next day without a copy (one a day)", () => {
    expect(echoSlot(posted, new Set(["2026-11-09", "2026-11-10"]))).toBe("2026-11-11T14:00:00.000Z");
  });
  it("skips when the whole week is taken", () => {
    const week = new Set(Array.from({ length: 7 }, (_, i) => `2026-11-${String(9 + i).padStart(2, "0")}`));
    expect(echoSlot(posted, week)).toBeNull();
  });
});
