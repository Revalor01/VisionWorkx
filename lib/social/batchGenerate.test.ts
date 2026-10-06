import { describe, expect, it } from "vitest";
import { planPost } from "./batchGenerate";

describe("planPost", () => {
  it("drafts anything not auto-approved", () => {
    expect(planPost({ approval: "review", platform: "facebook", canHero: true, imageFirst: false })).toEqual({ status: "draft", queueHero: false, autoImage: false });
  });

  it("queues a hero video on a video platform within cap", () => {
    expect(planPost({ approval: "auto", platform: "instagram", canHero: true, imageFirst: true })).toEqual({ status: "draft", queueHero: true, autoImage: false });
  });

  it("schedules Facebook, adding an image only for image-first brands", () => {
    expect(planPost({ approval: "auto", platform: "facebook", canHero: false, imageFirst: true })).toEqual({ status: "scheduled", queueHero: false, autoImage: true });
    expect(planPost({ approval: "auto", platform: "facebook", canHero: false, imageFirst: false })).toEqual({ status: "scheduled", queueHero: false, autoImage: false });
  });

  it("makes an Instagram post without a hero video an auto-image draft", () => {
    expect(planPost({ approval: "auto", platform: "instagram", canHero: false, imageFirst: false })).toEqual({ status: "draft", queueHero: false, autoImage: true });
  });

  it("leaves TikTok/YouTube without a video as drafts", () => {
    expect(planPost({ approval: "auto", platform: "tiktok", canHero: false, imageFirst: true })).toEqual({ status: "draft", queueHero: false, autoImage: false });
    expect(planPost({ approval: "auto", platform: "youtube", canHero: false, imageFirst: true })).toEqual({ status: "draft", queueHero: false, autoImage: false });
  });
});
