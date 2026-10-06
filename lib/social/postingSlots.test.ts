import { describe, expect, it } from "vitest";
import { scheduleOverDays } from "./postingSlots";

const now = new Date("2026-10-05T12:00:00Z");

describe("scheduleOverDays", () => {
  it("spreads perDay posts across days starting tomorrow, all in the future", () => {
    const slots = scheduleOverDays({ days: 3, perDay: 2, now });
    expect(slots).toHaveLength(6);
    expect(slots[0]).toBe("2026-10-06T14:00:00.000Z"); // tomorrow, first preferred hour
    expect(slots[1]).toBe("2026-10-06T17:00:00.000Z");
    expect(slots[2]).toBe("2026-10-07T14:00:00.000Z");
    for (const s of slots) expect(new Date(s).getTime()).toBeGreaterThan(now.getTime());
  });

  it("caps perDay at the number of preferred hours", () => {
    expect(scheduleOverDays({ days: 2, perDay: 9, now })).toHaveLength(6); // 2 days x 3 hours
  });
});
