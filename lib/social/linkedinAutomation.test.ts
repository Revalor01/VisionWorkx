import { describe, expect, it } from "vitest";
import { automationActive, isCadence, nextSlots } from "./linkedinAutomation";

const NOW = Date.parse("2026-11-20T12:00:00Z");

describe("automationActive", () => {
  it("is off when paused or past the end date", () => {
    expect(automationActive({ enabled: true, cadence: "weekly", ends_at: null }, NOW)).toBe(true);
    expect(automationActive({ enabled: false, cadence: "weekly", ends_at: null }, NOW)).toBe(false);
    expect(automationActive({ enabled: true, cadence: "weekly", ends_at: "2026-11-19T00:00:00Z" }, NOW)).toBe(false);
    expect(automationActive({ enabled: true, cadence: "weekly", ends_at: "2026-12-19T00:00:00Z" }, NOW)).toBe(true);
  });
});

describe("isCadence", () => {
  it("accepts only known cadences", () => {
    expect(isCadence("weekly")).toBe(true);
    expect(isCadence("daily")).toBe(false);
  });
});

describe("nextSlots", () => {
  const from = new Date(2026, 10, 20, 10, 0); // Fri 20 Nov 2026, 10am local
  const days = (ds: Date[]) => ds.map((d) => `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:00`);

  it("weekly = Tuesdays 9am", () => {
    expect(days(nextSlots("weekly", from, 3))).toEqual(["11/24 9:00", "12/1 9:00", "12/8 9:00"]);
  });
  it("twice weekly = Tue and Thu", () => {
    expect(days(nextSlots("twice_weekly", from, 3))).toEqual(["11/24 9:00", "11/26 9:00", "12/1 9:00"]);
  });
  it("biweekly = every other Tuesday", () => {
    expect(days(nextSlots("biweekly", from, 2))).toEqual(["11/24 9:00", "12/8 9:00"]);
  });
  it("skips days already taken and stops at the end date", () => {
    const taken = [new Date(2026, 10, 24, 15, 0).toISOString()];
    expect(days(nextSlots("weekly", from, 5, taken, new Date(2026, 11, 9).toISOString()))).toEqual(["12/1 9:00", "12/8 9:00"]);
  });
});
