import { describe, expect, it } from "vitest";
import { FB_STATS_FOLLOWER_THRESHOLD, followerChange } from "@/lib/social/pageFollowers";

describe("followerChange", () => {
  it("is latest minus first snapshot, null with fewer than two", () => {
    expect(followerChange([])).toBeNull();
    expect(followerChange([{ date: "2026-11-08", followers: 3 }])).toBeNull();
    expect(followerChange([{ date: "2026-11-01", followers: 3 }, { date: "2026-11-05", followers: 2 }, { date: "2026-11-08", followers: 9 }])).toBe(6);
  });
  it("uses Facebook's ~100-follower line", () => {
    expect(FB_STATS_FOLLOWER_THRESHOLD).toBe(100);
  });
});
