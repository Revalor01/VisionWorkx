import { describe, expect, it } from "vitest";
import { afterFailedAutoImage, imageFailureReason, internalBaseUrl, statusAfterAutoImage } from "./postImage";

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

describe("internalBaseUrl", () => {
  it("calls the app's own address, never Vercel's chosen custom domain (go.revalorllc.com redirects)", () => {
    expect(internalBaseUrl({ VERCEL_PROJECT_PRODUCTION_URL: "go.revalorllc.com" })).toBe("https://vision-workx.vercel.app");
    expect(internalBaseUrl({})).toBe("https://vision-workx.vercel.app");
  });
  it("can be overridden with INTERNAL_BASE_URL", () => {
    expect(internalBaseUrl({ INTERNAL_BASE_URL: "https://app.example.com/" })).toBe("https://app.example.com");
  });
});
describe("imageFailureReason", () => {
  it("labels and trims the error", () => {
    expect(imageFailureReason("boom")).toBe("Automatic image failed: boom");
    expect(imageFailureReason("x".repeat(600))).toHaveLength(500);
  });
});
