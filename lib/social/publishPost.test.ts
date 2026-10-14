import { describe, expect, it } from "vitest";
import { facebookPostKind } from "./publishPost";

describe("facebookPostKind", () => {
  it("a linked video goes out as a video (even if there's also an image)", () => {
    expect(facebookPostKind({ video_asset_id: "v1", image_path: "i.png" })).toBe("video");
  });
  it("an image without a video is a photo post", () => {
    expect(facebookPostKind({ video_asset_id: null, image_path: "i.png" })).toBe("photo");
  });
  it("neither is a text post (unchanged behaviour)", () => {
    expect(facebookPostKind({ video_asset_id: null, image_path: null })).toBe("text");
  });
});
