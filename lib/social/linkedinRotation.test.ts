import { describe, expect, it } from "vitest";
import { isPostType, rotationType, rotationWeek } from "./linkedinRotation";

describe("rotation", () => {
  it("cycles insight, story, insight, promo from the week of 23 Nov 2026", () => {
    const tuesdays = [24, 1, 8, 15, 22].map((d, i) => new Date(2026, i === 0 ? 10 : 11, d, 9));
    expect(tuesdays.map(rotationWeek)).toEqual([1, 2, 3, 4, 1]);
    expect(tuesdays.map(rotationType)).toEqual(["insight", "story", "insight", "promo", "insight"]);
  });
  it("treats every day of a week the same and works before the anchor", () => {
    expect(rotationWeek(new Date(2026, 10, 29))).toBe(1); // Sunday of week 1
    expect(rotationWeek(new Date(2026, 10, 30))).toBe(2); // next Monday
    expect(rotationWeek(new Date(2026, 10, 17))).toBe(4); // week before the anchor
  });
  it("validates types", () => {
    expect(isPostType("story")).toBe(true);
    expect(isPostType("pitch")).toBe(false);
  });
});
