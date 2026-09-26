import { describe, expect, it } from "vitest";
import { retentionDecision } from "./retention";

const now = new Date("2026-10-31T12:00:00Z");
const daysAgo = (d: number) => Math.floor((now.getTime() - d * 864e5) / 1000);

describe("retentionDecision", () => {
  it("deletes 30+ days after the subscription ended", () => {
    expect(retentionDecision({ status: "canceled", ended_at: daysAgo(31) }, now).action).toBe("delete");
    expect(retentionDecision({ status: "canceled", ended_at: daysAgo(30) }, now).action).toBe("delete");
  });
  it("waits inside the 30-day export window", () => {
    expect(retentionDecision({ status: "canceled", ended_at: daysAgo(29) }, now).action).toBe("wait");
  });
  it("never deletes when Stripe disagrees with our DB", () => {
    for (const status of ["active", "trialing", "past_due", "unpaid", "paused", "incomplete"] as const) {
      expect(retentionDecision({ status, ended_at: daysAgo(90) }, now).action).toBe("skip");
    }
    expect(retentionDecision(null, now).action).toBe("skip");
    expect(retentionDecision({ status: "canceled", ended_at: null }, now).action).toBe("skip");
  });
});
