import type { MarketingRecurrence } from "@/lib/database.types";

export interface RecurrenceSpec {
  recurrence: MarketingRecurrence;
  dayOfWeek: number | null; // 0 (Sunday) .. 6 (Saturday) — required for "weekly"
  dayOfMonth: number | null; // 1..31 — required for "monthly"
  hourUtc: number; // 0..23
}

// First occurrence of the day-of-week/day-of-month + hour combination
// strictly after `after`, in UTC. day_of_month clamps to the target
// month's last day, so day_of_month: 31 fires on Feb 28 (or 29).
export function computeNextRun(spec: RecurrenceSpec, after: Date): Date {
  if (spec.recurrence === "weekly") {
    if (spec.dayOfWeek === null) throw new Error("weekly recurrence requires dayOfWeek");
    return nextWeekly(spec.dayOfWeek, spec.hourUtc, after);
  }
  if (spec.dayOfMonth === null) throw new Error("monthly recurrence requires dayOfMonth");
  return nextMonthly(spec.dayOfMonth, spec.hourUtc, after);
}

function nextWeekly(dayOfWeek: number, hourUtc: number, after: Date): Date {
  const candidate = new Date(Date.UTC(after.getUTCFullYear(), after.getUTCMonth(), after.getUTCDate(), hourUtc, 0, 0, 0));
  let daysUntil = (dayOfWeek - candidate.getUTCDay() + 7) % 7;
  if (daysUntil === 0 && candidate <= after) daysUntil = 7;
  candidate.setUTCDate(candidate.getUTCDate() + daysUntil);
  return candidate;
}

function lastDayOfMonth(year: number, monthIndex0: number): number {
  return new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate();
}

function nextMonthly(dayOfMonth: number, hourUtc: number, after: Date): Date {
  let year = after.getUTCFullYear();
  let month = after.getUTCMonth();
  let day = Math.min(dayOfMonth, lastDayOfMonth(year, month));
  let candidate = new Date(Date.UTC(year, month, day, hourUtc, 0, 0, 0));

  if (candidate <= after) {
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
    day = Math.min(dayOfMonth, lastDayOfMonth(year, month));
    candidate = new Date(Date.UTC(year, month, day, hourUtc, 0, 0, 0));
  }

  return candidate;
}
