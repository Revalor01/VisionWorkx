import { describe, expect, it } from "vitest";
import { isQaEmail } from "./testWorkspaces";

describe("isQaEmail", () => {
  it("matches only the QA suite's own accounts", () => {
    expect(isQaEmail("qa+lz3k9a1b2c3@example.com")).toBe(true);
    expect(isQaEmail("QA+ABC123@EXAMPLE.COM")).toBe(true);
  });
  it("never matches real people", () => {
    expect(isQaEmail("qa@example.com")).toBe(false);
    expect(isQaEmail("qa+abc@gmail.com")).toBe(false);
    expect(isQaEmail("owner+qa+abc@example.com")).toBe(false);
    expect(isQaEmail("qa+abc@example.com.evil.io")).toBe(false);
    expect(isQaEmail("qa+a.b@example.com")).toBe(false);
    expect(isQaEmail(null)).toBe(false);
    expect(isQaEmail("")).toBe(false);
  });
});
