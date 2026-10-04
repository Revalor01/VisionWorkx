import { describe, expect, it } from "vitest";
import { afterFailedAutoImage, statusAfterAutoImage } from "./postImage";

describe("statusAfterAutoImage", () => {
  it("schedules drafts and approved posts once their image exists", () => {
    expect(statusAfterAutoImage("draft")).toBe("scheduled");
    expect(statusAfterAutoImage("approved")).toBe("scheduled");
  });
  it("leaves scheduled, posted and failed posts alone", () => {
    expect(statusAfterAutoImage("scheduled")).toBe("scheduled");
    expect(statusAfterAutoImage("posted")).toBe("posted");
    expect(statusAfterAutoImage("failed")).toBe("failed");
  });
});

describe("afterFailedAutoImage", () => {
  it("counts attempts and gives up on the third failure", () => {
    expect(afterFailedAutoImage(0)).toEqual({ auto_image_attempts: 1 });
    expect(afterFailedAutoImage(1)).toEqual({ auto_image_attempts: 2 });
    expect(afterFailedAutoImage(2)).toEqual({ auto_image_attempts: 3, auto_image: false });
  });
});
