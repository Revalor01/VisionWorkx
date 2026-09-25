import { afterEach, describe, expect, it, vi } from "vitest";
import {
  canUseFullAppGeneration,
  fullAppGenerationEnabled,
  generationPausedResponse,
  WAITLIST_URL,
} from "./featureFlags";
import { ADMIN_EMAIL } from "./adminSso";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("fullAppGenerationEnabled", () => {
  it("is off when FULL_APP_GENERATION is unset", () => {
    vi.stubEnv("FULL_APP_GENERATION", "");
    expect(fullAppGenerationEnabled()).toBe(false);
  });

  it("is off for any value other than exactly 'true'", () => {
    for (const v of ["false", "1", "yes", "TRUE", " true"]) {
      vi.stubEnv("FULL_APP_GENERATION", v);
      expect(fullAppGenerationEnabled()).toBe(false);
    }
  });

  it("is on only when set to 'true'", () => {
    vi.stubEnv("FULL_APP_GENERATION", "true");
    expect(fullAppGenerationEnabled()).toBe(true);
  });
});

describe("canUseFullAppGeneration", () => {
  it("blocks regular users while frozen", () => {
    vi.stubEnv("FULL_APP_GENERATION", "");
    expect(canUseFullAppGeneration("owner@example.com")).toBe(false);
    expect(canUseFullAppGeneration(null)).toBe(false);
    expect(canUseFullAppGeneration(undefined)).toBe(false);
  });

  it("lets the operator through while frozen (case-insensitive)", () => {
    vi.stubEnv("FULL_APP_GENERATION", "");
    expect(canUseFullAppGeneration(ADMIN_EMAIL)).toBe(true);
    expect(canUseFullAppGeneration(ADMIN_EMAIL.toUpperCase())).toBe(true);
  });

  it("lets everyone through when the flag is on", () => {
    vi.stubEnv("FULL_APP_GENERATION", "true");
    expect(canUseFullAppGeneration("owner@example.com")).toBe(true);
  });
});

describe("generationPausedResponse", () => {
  it("returns 403 with a clear message and the waitlist link", async () => {
    const res = generationPausedResponse();
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("generation_paused");
    expect(body.waitlistUrl).toBe(WAITLIST_URL);
    expect(body.error).toContain("paused");
  });
});
