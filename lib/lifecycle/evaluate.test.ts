import { describe, expect, it } from "vitest";
import { DAY_MS, isActivationNudgeDue, isWelcomeDue, isWinBackDue } from "./evaluate";

// The lifecycle cron trusts these predicates for "who gets emailed right
// now" — a wrong boundary means either a double-send window overlap or a
// user silently never qualifying, so the edges matter more than the happy
// path.

const NOW = Date.parse("2026-08-27T12:00:00Z");

describe("isWelcomeDue", () => {
  it("is due for an account created moments ago", () => {
    expect(isWelcomeDue({ createdAt: new Date(NOW - 1000).toISOString(), lastSignInAt: null }, NOW)).toBe(true);
  });

  it("is due right at the 48h boundary", () => {
    expect(isWelcomeDue({ createdAt: new Date(NOW - 2 * DAY_MS).toISOString(), lastSignInAt: null }, NOW)).toBe(true);
  });

  it("is not due just past the 48h boundary", () => {
    expect(isWelcomeDue({ createdAt: new Date(NOW - 2 * DAY_MS - 1000).toISOString(), lastSignInAt: null }, NOW)).toBe(false);
  });
});

describe("isActivationNudgeDue", () => {
  it("is not due for an account created yesterday (too recent)", () => {
    expect(isActivationNudgeDue({ createdAt: new Date(NOW - 1 * DAY_MS).toISOString(), lastSignInAt: null }, NOW)).toBe(false);
  });

  it("is due for an account created 5 days ago that never signed back in", () => {
    expect(isActivationNudgeDue({ createdAt: new Date(NOW - 5 * DAY_MS).toISOString(), lastSignInAt: null }, NOW)).toBe(true);
  });

  it("is not due once the account is past the 10-day window (win-back's territory instead)", () => {
    expect(isActivationNudgeDue({ createdAt: new Date(NOW - 11 * DAY_MS).toISOString(), lastSignInAt: null }, NOW)).toBe(false);
  });

  it("is not due if the user actually signed back in after signup", () => {
    const createdAt = new Date(NOW - 5 * DAY_MS);
    const lastSignInAt = new Date(createdAt.getTime() + DAY_MS);
    expect(isActivationNudgeDue({ createdAt: createdAt.toISOString(), lastSignInAt: lastSignInAt.toISOString() }, NOW)).toBe(false);
  });
});

describe("isWinBackDue", () => {
  it("is not due at exactly the threshold minus a moment (too recent)", () => {
    const lastSignInAt = new Date(NOW - 30 * DAY_MS + 1000).toISOString();
    expect(isWinBackDue({ createdAt: lastSignInAt, lastSignInAt }, 30, NOW)).toBe(false);
  });

  it("is due right at the 30-day threshold", () => {
    const lastSignInAt = new Date(NOW - 30 * DAY_MS).toISOString();
    expect(isWinBackDue({ createdAt: lastSignInAt, lastSignInAt }, 30, NOW)).toBe(true);
  });

  it("is due within the 7-day capture window past the threshold", () => {
    const lastSignInAt = new Date(NOW - 33 * DAY_MS).toISOString();
    expect(isWinBackDue({ createdAt: lastSignInAt, lastSignInAt }, 30, NOW)).toBe(true);
  });

  it("is not due once past the capture window (an earlier run should have already caught it)", () => {
    const lastSignInAt = new Date(NOW - 38 * DAY_MS).toISOString();
    expect(isWinBackDue({ createdAt: lastSignInAt, lastSignInAt }, 30, NOW)).toBe(false);
  });

  it("falls back to createdAt when the user never signed in at all", () => {
    const createdAt = new Date(NOW - 90 * DAY_MS).toISOString();
    expect(isWinBackDue({ createdAt, lastSignInAt: null }, 90, NOW)).toBe(true);
  });

  it("the 30/60/90 windows don't overlap for a single stale account", () => {
    const lastSignInAt = new Date(NOW - 45 * DAY_MS).toISOString();
    const record = { createdAt: lastSignInAt, lastSignInAt };
    expect(isWinBackDue(record, 30, NOW)).toBe(false);
    expect(isWinBackDue(record, 60, NOW)).toBe(false);
    expect(isWinBackDue(record, 90, NOW)).toBe(false);
  });
});
