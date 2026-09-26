import { describe, expect, it } from "vitest";
import {
  bookingValues,
  canChange,
  DEFAULT_BOOKING,
  generateSlots,
  icsFor,
  isSlotAvailable,
  localDate,
  parseBookingSetup,
  whenText,
  zonedTime,
  type BookingSetup,
} from "./booking";

const NY = "America/New_York";
const setup: BookingSetup = parseBookingSetup({
  services: [{ id: "call", name: "Call", durationMin: 30, bufferMin: 15 }],
  weekly: [[], [{ start: "09:00", end: "11:00" }], [], [], [], [], []], // Mondays 9-11
  minNoticeHours: 0,
  maxDaysAhead: 365,
  slotStepMin: 30,
  timeZone: NY,
});
const call = setup.services[0];
const longAgo = new Date("2026-01-01T00:00:00Z");
const iso = (ds: Date[]) => ds.map((d) => d.toISOString());

describe("zonedTime (Intl-only time-zone math)", () => {
  it("converts wall-clock times in and out of daylight saving", () => {
    expect(zonedTime(2026, 1, 12, 9, 0, NY)!.toISOString()).toBe("2026-01-12T14:00:00.000Z"); // EST -5
    expect(zonedTime(2026, 7, 13, 9, 0, NY)!.toISOString()).toBe("2026-07-13T13:00:00.000Z"); // EDT -4
    expect(zonedTime(2026, 7, 13, 9, 0, "Asia/Kolkata")!.toISOString()).toBe("2026-07-13T03:30:00.000Z");
  });
  it("returns null for times skipped by spring-forward (Mar 8 2026, 2:30 AM)", () => {
    expect(zonedTime(2026, 3, 8, 2, 30, NY)).toBeNull();
  });
  it("uses the earlier instant for the repeated fall-back hour (Nov 1 2026, 1:30 AM)", () => {
    expect(zonedTime(2026, 11, 1, 1, 30, NY)!.toISOString()).toBe("2026-11-01T05:30:00.000Z"); // still EDT
  });
});

describe("generateSlots", () => {
  it("offers slots inside the weekly hours, in the business time zone", () => {
    // Monday Jan 12 2026, 9-11 EST, 30 min + 15 buffer, step 30
    expect(iso(generateSlots(setup, call, "2026-01-12", 1, [], longAgo))).toEqual([
      "2026-01-12T14:00:00.000Z",
      "2026-01-12T14:30:00.000Z",
      "2026-01-12T15:00:00.000Z",
      "2026-01-12T15:30:00.000Z",
    ]);
  });

  it("keeps local times steady across the DST change", () => {
    const before = generateSlots(setup, call, "2026-03-02", 1, [], longAgo)[0]; // Monday before
    const after = generateSlots(setup, call, "2026-03-09", 1, [], longAgo)[0]; // Monday after
    expect(before.toISOString()).toBe("2026-03-02T14:00:00.000Z");
    expect(after.toISOString()).toBe("2026-03-09T13:00:00.000Z");
  });

  it("blocks slots that overlap existing bookings including buffers", () => {
    const busy = [{ start: new Date("2026-01-12T14:30:00Z"), end: new Date("2026-01-12T15:15:00Z") }];
    // 9:00 (ends 9:45 incl buffer) overlaps 9:30 booking; 10:00 overlaps until 10:15 -> both gone
    expect(iso(generateSlots(setup, call, "2026-01-12", 1, busy, longAgo))).toEqual(["2026-01-12T15:30:00.000Z"]);
  });

  it("honours minimum notice, horizon and days off", () => {
    const now = new Date("2026-01-12T14:10:00Z"); // 9:10 EST
    const noticed = { ...setup, minNoticeHours: 1 };
    expect(iso(generateSlots(noticed, call, "2026-01-12", 1, [], now))).toEqual(["2026-01-12T15:30:00.000Z"]);
    expect(generateSlots({ ...setup, maxDaysAhead: 3 }, call, "2026-01-19", 1, [], now)).toEqual([]);
    expect(generateSlots({ ...setup, daysOff: ["2026-01-12"] }, call, "2026-01-12", 1, [], longAgo)).toEqual([]);
  });

  it("never offers a slot that doesn't fit before closing", () => {
    const long = { ...call, durationMin: 90 };
    expect(iso(generateSlots(setup, long, "2026-01-12", 1, [], longAgo))).toEqual(["2026-01-12T14:00:00.000Z", "2026-01-12T14:30:00.000Z"]);
  });
});

describe("isSlotAvailable (server re-check)", () => {
  it("accepts offered slots and rejects anything else", () => {
    expect(isSlotAvailable(setup, call, new Date("2026-01-12T14:30:00Z"), [], longAgo)).toBe(true);
    expect(isSlotAvailable(setup, call, new Date("2026-01-12T14:45:00Z"), [], longAgo)).toBe(false); // off-grid
    expect(isSlotAvailable(setup, call, new Date("2026-01-13T14:30:00Z"), [], longAgo)).toBe(false); // Tuesday, closed
    expect(isSlotAvailable(setup, call, new Date("nope"), [], longAgo)).toBe(false);
  });
});

describe("parseBookingSetup", () => {
  it("drops bad windows/dates and falls back to a valid time zone", () => {
    const p = parseBookingSetup({
      services: [{ name: "X", durationMin: 9999 }],
      weekly: [[{ start: "17:00", end: "09:00" }, { start: "9:00", end: "10:00" }, { start: "08:00", end: "09:00" }]],
      daysOff: ["2026-12-25", "junk", "2026-12-25"],
      slotStepMin: 7,
      timeZone: "Mars/Olympus",
    });
    expect(p.services[0].durationMin).toBe(480);
    expect(p.weekly[0]).toEqual([{ start: "08:00", end: "09:00" }]);
    expect(p.daysOff).toEqual(["2026-12-25"]);
    expect(p.slotStepMin).toBe(30);
    expect(p.timeZone).toBe("America/New_York");
  });
  it("keeps the default setup intact", () => {
    expect(parseBookingSetup(DEFAULT_BOOKING)).toEqual(DEFAULT_BOOKING);
  });
});

describe("display + helpers", () => {
  it("shows the customer's own time when their zone differs", () => {
    const t = new Date("2026-01-12T14:00:00Z");
    expect(whenText(t, setup, "America/Los_Angeles")).toBe("Mon, Jan 12, 9:00 AM EST (6:00 AM your time)");
    expect(whenText(t, setup, NY)).toBe("Mon, Jan 12, 9:00 AM EST");
    expect(localDate(t, "Asia/Tokyo")).toBe("2026-01-12");
  });
  it("enforces the change cutoff", () => {
    const start = new Date("2026-01-12T14:00:00Z");
    expect(canChange(setup, start, new Date("2026-01-11T13:00:00Z"))).toBe(true); // 25h before
    expect(canChange(setup, start, new Date("2026-01-11T15:00:00Z"))).toBe(false); // 23h before
  });
  it("builds labelled values and a valid .ics", () => {
    const v = bookingValues({ whenText: "Mon, Jan 12, 9:00 AM EST", service: call, manageUrl: "https://x/b/t", locationNote: "Video call" });
    expect(v).toEqual({ bk_when: "Mon, Jan 12, 9:00 AM EST", bk_service: "Call (30 min) · Video call", bk_manage: "https://x/b/t" });
    const ics = icsFor({ uid: "abc", start: new Date("2026-01-12T14:00:00Z"), end: new Date("2026-01-12T14:30:00Z"), title: "Call, with Acme", description: "Line1\nLine2", location: "" });
    expect(ics).toContain("DTSTART:20260112T140000Z");
    expect(ics).toContain("SUMMARY:Call\\, with Acme");
    expect(ics).toContain("DESCRIPTION:Line1\\nLine2");
  });
});
