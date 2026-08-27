import { describe, expect, it } from "vitest";
import { computeNextRun } from "./recurrence";

// The cron scan trusts next_run_at to decide what fires — an off-by-one
// here means a digest silently skips a week/month or fires twice, so the
// boundary cases (exactly at the target hour, month-length clamping) are
// worth testing explicitly rather than trusting the arithmetic by eye.

describe("computeNextRun / weekly", () => {
  it("finds the next occurrence later in the same week", () => {
    // Wed 2026-08-26 10:00 UTC -> next Friday (5) at 14:00 UTC
    const after = new Date("2026-08-26T10:00:00Z");
    const next = computeNextRun({ recurrence: "weekly", dayOfWeek: 5, dayOfMonth: null, hourUtc: 14 }, after);
    expect(next.toISOString()).toBe("2026-08-28T14:00:00.000Z");
  });

  it("wraps to next week when the target day already passed this week", () => {
    // Fri 2026-08-28 10:00 UTC, target Wednesday (3) -> next Wednesday
    const after = new Date("2026-08-28T10:00:00Z");
    const next = computeNextRun({ recurrence: "weekly", dayOfWeek: 3, dayOfMonth: null, hourUtc: 9 }, after);
    expect(next.toISOString()).toBe("2026-09-02T09:00:00.000Z");
  });

  it("rolls to next week when it's the target day but the hour already passed", () => {
    const after = new Date("2026-08-26T15:00:00Z"); // Wednesday, 15:00 UTC
    const next = computeNextRun({ recurrence: "weekly", dayOfWeek: 3, dayOfMonth: null, hourUtc: 9 }, after);
    expect(next.toISOString()).toBe("2026-09-02T09:00:00.000Z");
  });

  it("fires later the same day when it's the target day and the hour hasn't passed yet", () => {
    const after = new Date("2026-08-26T05:00:00Z"); // Wednesday, 05:00 UTC
    const next = computeNextRun({ recurrence: "weekly", dayOfWeek: 3, dayOfMonth: null, hourUtc: 9 }, after);
    expect(next.toISOString()).toBe("2026-08-26T09:00:00.000Z");
  });
});

describe("computeNextRun / monthly", () => {
  it("finds the next occurrence later in the same month", () => {
    const after = new Date("2026-08-05T00:00:00Z");
    const next = computeNextRun({ recurrence: "monthly", dayOfWeek: null, dayOfMonth: 15, hourUtc: 12 }, after);
    expect(next.toISOString()).toBe("2026-08-15T12:00:00.000Z");
  });

  it("rolls to next month when the target day already passed", () => {
    const after = new Date("2026-08-20T00:00:00Z");
    const next = computeNextRun({ recurrence: "monthly", dayOfWeek: null, dayOfMonth: 15, hourUtc: 12 }, after);
    expect(next.toISOString()).toBe("2026-09-15T12:00:00.000Z");
  });

  it("clamps day_of_month 31 to February's last day", () => {
    const after = new Date("2026-01-31T13:00:00Z");
    const next = computeNextRun({ recurrence: "monthly", dayOfWeek: null, dayOfMonth: 31, hourUtc: 12 }, after);
    expect(next.toISOString()).toBe("2026-02-28T12:00:00.000Z");
  });

  it("clamps to a leap-year February 29th", () => {
    const after = new Date("2028-01-31T13:00:00Z");
    const next = computeNextRun({ recurrence: "monthly", dayOfWeek: null, dayOfMonth: 31, hourUtc: 12 }, after);
    expect(next.toISOString()).toBe("2028-02-29T12:00:00.000Z");
  });

  it("wraps from December into January of the next year", () => {
    const after = new Date("2026-12-20T00:00:00Z");
    const next = computeNextRun({ recurrence: "monthly", dayOfWeek: null, dayOfMonth: 5, hourUtc: 8 }, after);
    expect(next.toISOString()).toBe("2027-01-05T08:00:00.000Z");
  });
});
