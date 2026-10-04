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
  it("prefers Vercel's production domain", () => {
    expect(internalBaseUrl({ VERCEL_PROJECT_PRODUCTION_URL: "vision-workx.vercel.app" })).toBe("https://vision-workx.vercel.app");
    expect(internalBaseUrl({ VERCEL_PROJECT_PRODUCTION_URL: "https://example.com/" })).toBe("https://example.com");
  });
  it("falls back to the app URL, then the default", () => {
    expect(internalBaseUrl({ NEXT_PUBLIC_APP_URL: "https://app.example.com/" })).toBe("https://app.example.com");
    expect(internalBaseUrl({})).toBe("https://vision-workx.vercel.app");
  });
});

describe("imageFailureReason", () => {
  it("labels and trims the error", () => {
    expect(imageFailureReason("boom")).toBe("Automatic image failed: boom");
    expect(imageFailureReason("x".repeat(600))).toHaveLength(500);
  });
});
