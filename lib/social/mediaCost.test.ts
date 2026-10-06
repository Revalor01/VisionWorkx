import { describe, expect, it } from "vitest";
import { estimateBatchCost, withinBudget, remainingBudget, VIDEO_USD } from "./mediaCost";

describe("mediaCost", () => {
  it("makes video the dominant cost", () => {
    const e = estimateBatchCost({ posts: 10, images: 10, videos: 3 });
    expect(e.videoUsd).toBeCloseTo(3 * VIDEO_USD, 2);
    expect(e.totalUsd).toBeCloseTo(e.captionUsd + e.imageUsd + e.videoUsd, 2);
    expect(e.videoUsd).toBeGreaterThan(e.imageUsd + e.captionUsd);
  });

  it("is zero media cost with no images or videos", () => {
    const e = estimateBatchCost({ posts: 10 });
    expect(e.videoUsd).toBe(0);
    expect(e.imageUsd).toBe(0);
  });

  it("respects the cap", () => {
    expect(withinBudget(20, 4, 25)).toBe(true);
    expect(withinBudget(20, 6, 25)).toBe(false);
    expect(remainingBudget(20, 25)).toBe(5);
    expect(remainingBudget(30, 25)).toBe(0);
  });
});
