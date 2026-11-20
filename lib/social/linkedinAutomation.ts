import type { createServiceClient } from "@/lib/supabase";

// Controls for the Zapier LinkedIn automation (table linkedin_automation,
// migration 111). Pure helpers + a tolerant loader: a missing table or row
// means the defaults (on, weekly, no end), so the feed never breaks on it.

export const LINKEDIN_CADENCES = ["weekly", "twice_weekly", "biweekly"] as const;
export type LinkedInCadence = (typeof LINKEDIN_CADENCES)[number];

export const CADENCE_LABEL: Record<LinkedInCadence, string> = {
  weekly: "Weekly · Tue 9am",
  twice_weekly: "Twice a week · Tue & Thu 9am",
  biweekly: "Every other week · Tue 9am",
};

export interface LinkedInAutomation {
  enabled: boolean;
  cadence: LinkedInCadence;
  ends_at: string | null;
  updated_at?: string | null;
}

export const AUTOMATION_DEFAULTS: LinkedInAutomation = { enabled: true, cadence: "weekly", ends_at: null };

export function isCadence(v: unknown): v is LinkedInCadence {
  return typeof v === "string" && (LINKEDIN_CADENCES as readonly string[]).includes(v);
}

/** Sending is on: switched on and the run hasn't ended. */
export function automationActive(s: LinkedInAutomation, now: number): boolean {
  if (!s.enabled) return false;
  return !s.ends_at || new Date(s.ends_at).getTime() > now;
}

type Service = ReturnType<typeof createServiceClient>;

export async function loadAutomation(service: Service): Promise<LinkedInAutomation> {
  const { data, error } = await service.from("linkedin_automation").select("enabled, cadence, ends_at, updated_at").eq("id", 1).maybeSingle();
  if (error || !data) {
    if (error) console.error("[linkedin automation] using defaults:", error.message);
    return { ...AUTOMATION_DEFAULTS };
  }
  return {
    enabled: data.enabled,
    cadence: isCadence(data.cadence) ? data.cadence : "weekly",
    ends_at: data.ends_at,
    updated_at: data.updated_at,
  };
}

// --- Slots (run in the browser, so they use the owner's local time) ---

const DAY_MS = 864e5;

/** Is this local date a slot day for the cadence? Biweekly = every other Tuesday from a fixed anchor. */
function isSlotDay(d: Date, cadence: LinkedInCadence): boolean {
  const dow = d.getDay();
  if (cadence === "twice_weekly") return dow === 2 || dow === 4;
  if (dow !== 2) return false;
  if (cadence === "weekly") return true;
  // Anchor: Tue 2026-11-24. Even number of weeks from it = slot week.
  const anchor = new Date(2026, 10, 24);
  const weeks = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - anchor.getTime()) / (7 * DAY_MS));
  return weeks % 2 === 0;
}

/**
 * The next `count` slot times (9:00 local) after `from`, skipping any whose
 * local day already has a post in `taken`, and stopping at `endsAt`.
 */
export function nextSlots(
  cadence: LinkedInCadence,
  from: Date,
  count: number,
  taken: (string | null)[] = [],
  endsAt: string | null = null,
): Date[] {
  const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const takenDays = new Set(taken.filter((t): t is string => !!t).map((t) => dayKey(new Date(t))));
  const end = endsAt ? new Date(endsAt).getTime() : Infinity;
  const out: Date[] = [];
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate(), 9, 0, 0, 0);
  for (let i = 0; i < 400 && out.length < count; i++, d.setDate(d.getDate() + 1)) {
    if (d.getTime() <= from.getTime()) continue;
    if (d.getTime() > end) break;
    if (!isSlotDay(d, cadence) || takenDays.has(dayKey(d))) continue;
    out.push(new Date(d));
  }
  return out;
}
