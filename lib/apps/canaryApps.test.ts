import { describe, expect, it } from "vitest";
import { CANARY_MODEL, STANDARD_MODEL, isCanaryPreviewEmail, modelForApp } from "./canaryApps";

describe("isCanaryPreviewEmail", () => {
  it("is true for the fixed canary+<key>@visionworkx.internal pattern", () => {
    expect(isCanaryPreviewEmail("canary+storefront@visionworkx.internal")).toBe(true);
    expect(isCanaryPreviewEmail("canary+booking_crm@visionworkx.internal")).toBe(true);
  });

  it("is false for real customer and pre-signup preview emails", () => {
    expect(isCanaryPreviewEmail("real.customer@gmail.com")).toBe(false);
    expect(isCanaryPreviewEmail("someone@visionworkx.dev")).toBe(false);
  });

  it("is false for null or undefined", () => {
    expect(isCanaryPreviewEmail(null)).toBe(false);
    expect(isCanaryPreviewEmail(undefined)).toBe(false);
  });

  it("doesn't false-positive on a domain that merely contains the suffix as a substring elsewhere", () => {
    expect(isCanaryPreviewEmail("visionworkx.internal.evil.com")).toBe(false);
  });
});

describe("modelForApp", () => {
  it("picks the cheaper canary model for canary preview emails", () => {
    expect(modelForApp("canary+portal@visionworkx.internal")).toBe(CANARY_MODEL);
  });

  it("picks the standard model for everyone else", () => {
    expect(modelForApp("real.customer@gmail.com")).toBe(STANDARD_MODEL);
    expect(modelForApp(null)).toBe(STANDARD_MODEL);
  });
});
