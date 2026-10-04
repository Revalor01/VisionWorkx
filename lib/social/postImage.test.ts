import { describe, expect, it } from "vitest";
import { statusAfterAutoImage } from "./postImage";

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
