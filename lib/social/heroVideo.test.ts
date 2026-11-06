import { describe, expect, it } from "vitest";
import { heroVideoRelease, renaissanceWantsVideo } from "./heroVideo";

describe("renaissanceWantsVideo", () => {
  it("only for a requested, scheduled, Facebook, non-kids post", () => {
    expect(renaissanceWantsVideo({ heroVideo: true, platform: "facebook" }, "business", true)).toBe(true);
    expect(renaissanceWantsVideo({ heroVideo: false, platform: "facebook" }, "business", true)).toBe(false);
    expect(renaissanceWantsVideo({ heroVideo: true, platform: "instagram" }, "business", true)).toBe(false);
    expect(renaissanceWantsVideo({ heroVideo: true, platform: "facebook" }, "kids", true)).toBe(false);
    expect(renaissanceWantsVideo({ heroVideo: true, platform: "facebook" }, "business", false)).toBe(false);
  });
});

describe("heroVideoRelease", () => {
  it("releases a Renaissance post waiting as approved, with or without the video", () => {
    const waiting = { status: "approved", scheduled_at: "2026-11-08T14:00:00Z" };
    expect(heroVideoRelease(waiting, "ready")).toEqual({ status: "scheduled", dropVideo: false, from: "approved" });
    expect(heroVideoRelease(waiting, "failed")).toEqual({ status: "scheduled", dropVideo: true, from: "approved" });
  });
  it("never releases a post Renaissance pulled back (draft, no time) on failure, nor anything already out", () => {
    expect(heroVideoRelease({ status: "draft", scheduled_at: null }, "failed")).toBeNull();
    expect(heroVideoRelease({ status: "draft", scheduled_at: null }, "ready")).toBeNull();
    expect(heroVideoRelease({ status: "posted", scheduled_at: "x" }, "ready")).toBeNull();
    expect(heroVideoRelease(null, "ready")).toBeNull();
  });
  it("keeps the batch behaviour: a draft is scheduled once its video is ready", () => {
    expect(heroVideoRelease({ status: "draft", scheduled_at: "2026-11-08T14:00:00Z" }, "ready")).toEqual({ status: "scheduled", dropVideo: false, from: "draft" });
  });
});
