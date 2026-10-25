import { describe, expect, it } from "vitest";
import { effectiveCadence, isCadence, isDue, isProductCadence } from "./schedule";

const DAY = 24 * 3600e3;
const now = Date.parse("2026-10-24T11:00:00Z");

describe("effectiveCadence", () => {
  it("uses the override when it's a concrete cadence", () => {
    expect(effectiveCadence("weekly", "nightly")).toBe("weekly");
    expect(effectiveCadence("off", "nightly")).toBe("off");
  });
  it("falls back to the global default for 'default' or no override", () => {
    expect(effectiveCadence("default", "every_3_days")).toBe("every_3_days");
    expect(effectiveCadence(undefined, "weekly")).toBe("weekly");
  });
});

describe("isDue", () => {
  it("is never due when off", () => {
    expect(isDue("off", null, now)).toBe(false);
    expect(isDue("off", new Date(now - 30 * DAY).toISOString(), now)).toBe(false);
  });
  it("is due when never run on a schedule", () => {
    expect(isDue("nightly", null, now)).toBe(true);
    expect(isDue("weekly", null, now)).toBe(true);
  });
  it("nightly: due ~a day later, not a few hours later", () => {
    expect(isDue("nightly", new Date(now - DAY).toISOString(), now)).toBe(true);
    expect(isDue("nightly", new Date(now - 3 * 3600e3).toISOString(), now)).toBe(false);
  });
  it("respects the slack so a fixed-hour daily cron still fires each day", () => {
    // Yesterday's run landed 23h55m ago (minor drift) — still due.
    expect(isDue("nightly", new Date(now - (DAY - 5 * 60e3)).toISOString(), now)).toBe(true);
  });
  it("every_3_days and weekly honour their intervals", () => {
    expect(isDue("every_3_days", new Date(now - 2 * DAY).toISOString(), now)).toBe(false);
    expect(isDue("every_3_days", new Date(now - 3 * DAY).toISOString(), now)).toBe(true);
    expect(isDue("weekly", new Date(now - 6 * DAY).toISOString(), now)).toBe(false);
    expect(isDue("weekly", new Date(now - 7 * DAY).toISOString(), now)).toBe(true);
  });
});

describe("validators", () => {
  it("isCadence", () => {
    expect(isCadence("nightly")).toBe(true);
    expect(isCadence("off")).toBe(true);
    expect(isCadence("default")).toBe(false);
    expect(isCadence("hourly")).toBe(false);
    expect(isCadence(3)).toBe(false);
  });
  it("isProductCadence allows 'default'", () => {
    expect(isProductCadence("default")).toBe(true);
    expect(isProductCadence("weekly")).toBe(true);
    expect(isProductCadence("nope")).toBe(false);
  });
});
