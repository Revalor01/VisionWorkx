import { describe, it, expect } from "vitest";
import { classifyBuildError, isInfraFailure } from "./buildFailure";

describe("classifyBuildError", () => {
  it("detects Anthropic credit exhaustion", () => {
    expect(
      classifyBuildError(
        '400 {"error":{"message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing"}}',
      ),
    ).toBe("anthropic_credits");
  });

  it("detects overload (529)", () => {
    expect(classifyBuildError("Error 529: overloaded_error")).toBe("anthropic_overloaded");
  });

  it("detects rate limits (429)", () => {
    expect(classifyBuildError("429 too many requests / rate_limit_error")).toBe(
      "anthropic_rate_limit",
    );
  });

  it("detects timeouts", () => {
    expect(classifyBuildError("Vercel Runtime Timeout Error: Task timed out after 900 seconds")).toBe(
      "timeout",
    );
  });

  it("detects build errors", () => {
    expect(classifyBuildError("Error [BuildError]: Build ERROR")).toBe("build_error");
    expect(classifyBuildError("Failed to compile.")).toBe("build_error");
  });

  it("falls back to generation for anything else", () => {
    expect(classifyBuildError("some unexpected stream hiccup")).toBe("generation");
    expect(classifyBuildError("")).toBe("generation");
  });

  it("marks infra failures as on-us", () => {
    expect(isInfraFailure("anthropic_credits")).toBe(true);
    expect(isInfraFailure("timeout")).toBe(true);
    expect(isInfraFailure("generation")).toBe(false);
    expect(isInfraFailure("build_error")).toBe(false);
  });
});
