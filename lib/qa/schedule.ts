// How often each product's full ("nightly") QA run is dispatched. The schedule
// lives in vw_qa_schedule: one row per product for an override, plus the row
// product_slug = '*' holding the global default. A product row of 'default' (or
// no row) follows the global default. The /api/cron/qa-schedule cron runs daily
// and dispatches each enabled product whose run is due.
//
// This module is pure (no DB, no secrets) so client components can import the
// labels and types; the DB load lives in scheduleDb.ts.

export const GLOBAL_SLUG = "*";

// Concrete cadences a product (or the global default) can run on.
export const CADENCES = ["nightly", "every_2_days", "every_3_days", "weekly", "off"] as const;
export type Cadence = (typeof CADENCES)[number];

// A product may also defer to the global default.
export type ProductCadence = Cadence | "default";

export const CADENCE_DAYS: Record<Exclude<Cadence, "off">, number> = {
  nightly: 1,
  every_2_days: 2,
  every_3_days: 3,
  weekly: 7,
};

export const CADENCE_LABEL: Record<Cadence, string> = {
  nightly: "Every night",
  every_2_days: "Every 2 days",
  every_3_days: "Every 3 days",
  weekly: "Weekly (Sundays)",
  off: "Off",
};

export function isCadence(v: unknown): v is Cadence {
  return typeof v === "string" && (CADENCES as readonly string[]).includes(v);
}

export function isProductCadence(v: unknown): v is ProductCadence {
  return v === "default" || isCadence(v);
}

/** The effective cadence for a product given its override and the global default. */
export function effectiveCadence(override: ProductCadence | undefined, globalDefault: Cadence): Cadence {
  if (!override || override === "default") return globalDefault;
  return override;
}

// Weekly runs are pinned to one day so every product tests together: Sunday,
// in Eastern time (the cron's 11:00 UTC check is Sunday morning ET).
export const WEEKLY_DAY = 0; // Sunday
const WEEKLY_TZ = "America/New_York";
// Already ran within this many days → don't run again (stops a second run the
// same Sunday, while a run last Sunday is comfortably outside it).
const WEEKLY_MIN_GAP_DAYS = 5;

function weekdayIn(tz: string, at: number): number {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(at);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(name);
}

/**
 * Is a product due for a scheduled run? `lastRunAt` is the created_at of its
 * most recent scheduled run (null = never run on a schedule). The daily cron
 * fires at a fixed hour, so a 2h slack is subtracted from the interval — without
 * it a run from "yesterday at 11:00" would read as not-yet-24h and be skipped.
 */
export function isDue(cadence: Cadence, lastRunAt: string | null, now = Date.now()): boolean {
  if (cadence === "off") return false;
  // Weekly: only on Sunday (ET) — including products never run yet — and not
  // if one already ran in the last few days.
  if (cadence === "weekly") {
    if (weekdayIn(WEEKLY_TZ, now) !== WEEKLY_DAY) return false;
    return !lastRunAt || now - new Date(lastRunAt).getTime() >= WEEKLY_MIN_GAP_DAYS * 24 * 3600e3;
  }
  if (!lastRunAt) return true;
  const thresholdMs = CADENCE_DAYS[cadence] * 24 * 3600e3 - 2 * 3600e3;
  return now - new Date(lastRunAt).getTime() >= thresholdMs;
}
