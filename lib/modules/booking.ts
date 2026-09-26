// Online booking (A7-A). Services, weekly hours and rules live in the module
// config under `booking` (the rest of the config is an ordinary FormConfig
// whose fields are the contact questions, like the quote calculator).
//
// Slot generation is pure and time-zone correct using only Intl, so the
// visitor's browser, the slots API and the submit route all agree. The
// database has the final say on double-booking (exclusion constraint on
// vw_bookings); this module decides what's *offered*.

export interface BookingService {
  id: string;
  name: string;
  durationMin: number; // 5-480
  bufferMin: number; // 0-240, blocked after the appointment
  priceLabel: string; // "$150", "Free" -- shown as-is
  description: string;
}

export interface TimeWindow {
  start: string; // "HH:MM" local to the business
  end: string;
}

export interface BookingSetup {
  services: BookingService[];
  /** Index 0 = Sunday ... 6 = Saturday. */
  weekly: TimeWindow[][];
  daysOff: string[]; // "YYYY-MM-DD" in the business's time zone
  minNoticeHours: number;
  maxDaysAhead: number;
  slotStepMin: number;
  cancelCutoffHours: number;
  timeZone: string; // IANA
  locationNote: string; // "We'll send a video link", "123 Main St"
}

export interface Busy {
  start: Date;
  end: Date; // end of the blocked range (appointment + buffer)
}

export const SLOT_STEPS = [5, 10, 15, 20, 30, 45, 60] as const;
export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
/** Submission keys for booking details; contact fields never use this prefix. */
export const BOOKING_KEY_PREFIX = "bk_";
const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ID_RE = /^[a-z][a-z0-9_]{0,39}$/;

export function isBookingModule(type: string): boolean {
  return type === "booking";
}

// ── time zones (Intl only) ───────────────────────────────────────────────────

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const partsCache = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string): Intl.DateTimeFormat {
  let f = partsCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
    });
    partsCache.set(tz, f);
  }
  return f;
}

export interface LocalParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  weekday: number; // 0 = Sunday
}

const WD: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function localParts(d: Date, tz: string): LocalParts {
  const p: Record<string, string> = {};
  for (const x of fmt(tz).formatToParts(d)) p[x.type] = x.value;
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour) % 24,
    minute: Number(p.minute),
    weekday: WD[p.weekday] ?? 0,
  };
}

/** Offset of `tz` from UTC at instant `d`, in minutes (e.g. -240 for EDT). */
function offsetMinutes(d: Date, tz: string): number {
  const p = localParts(d, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return Math.round((asUtc - Math.floor(d.getTime() / 60000) * 60000) / 60000);
}

/**
 * The instant a wall-clock time happens in `tz`, or null when that time
 * doesn't exist (skipped by a daylight-saving jump). For a repeated hour
 * (fall back) the earlier instant is used.
 */
export function zonedTime(year: number, month: number, day: number, hour: number, minute: number, tz: string): Date | null {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const candidates = new Set<number>();
  for (const probe of [guess - 14 * 3600e3, guess, guess + 14 * 3600e3]) {
    candidates.add(guess - offsetMinutes(new Date(probe), tz) * 60000);
  }
  const hits = [...candidates]
    .filter((t) => {
      const p = localParts(new Date(t), tz);
      return p.year === year && p.month === month && p.day === day && p.hour === hour && p.minute === minute;
    })
    .sort((a, b) => a - b);
  return hits.length ? new Date(hits[0]) : null;
}

/** "YYYY-MM-DD" of an instant in `tz`. */
export function localDate(d: Date, tz: string): string {
  const p = localParts(d, tz);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

function weekdayOf(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

// ── parsing ─────────────────────────────────────────────────────────────────

function str(v: unknown, max: number, fallback = ""): string {
  return typeof v === "string" ? v.trim().slice(0, max) : fallback;
}
function num(v: unknown, lo: number, hi: number, fallback: number): number {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : fallback;
}
function toId(label: string, taken: Set<string>): string {
  let base = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 32) || "service";
  if (!/^[a-z]/.test(base)) base = `s_${base}`;
  let id = base;
  for (let i = 2; taken.has(id); i++) id = `${base}_${i}`.slice(0, 40);
  return id;
}

function parseWindows(raw: unknown): TimeWindow[] {
  const out: TimeWindow[] = [];
  for (const w of Array.isArray(raw) ? raw.slice(0, 6) : []) {
    if (!w || typeof w !== "object") continue;
    const r = w as Record<string, unknown>;
    const start = str(r.start, 5);
    const end = str(r.end, 5);
    if (HHMM.test(start) && HHMM.test(end) && toMinutes(end) > toMinutes(start)) out.push({ start, end });
  }
  return out.sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
}

export function parseBookingSetup(raw: unknown, fallbackTimeZone = "America/New_York"): BookingSetup {
  const c = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const taken = new Set<string>();
  const services: BookingService[] = [];
  for (const s of Array.isArray(c.services) ? c.services.slice(0, 20) : []) {
    if (!s || typeof s !== "object") continue;
    const r = s as Record<string, unknown>;
    const name = str(r.name, 80);
    if (!name) continue;
    const rawId = str(r.id, 40);
    const id = ID_RE.test(rawId) && !taken.has(rawId) ? rawId : toId(name, taken);
    taken.add(id);
    services.push({
      id,
      name,
      durationMin: num(r.durationMin, 5, 480, 30),
      bufferMin: num(r.bufferMin, 0, 240, 0),
      priceLabel: str(r.priceLabel, 30),
      description: str(r.description, 200),
    });
  }
  const weeklyRaw = Array.isArray(c.weekly) ? c.weekly : [];
  const weekly = Array.from({ length: 7 }, (_, i) => parseWindows(weeklyRaw[i]));
  const daysOff = [...new Set((Array.isArray(c.daysOff) ? c.daysOff : []).map((d) => str(d, 10)).filter((d) => DATE_RE.test(d)))]
    .sort()
    .slice(0, 200);
  const step = num(c.slotStepMin, 5, 60, 30);
  const tz = str(c.timeZone, 64);
  return {
    services,
    weekly,
    daysOff,
    minNoticeHours: num(c.minNoticeHours, 0, 720, 12),
    maxDaysAhead: num(c.maxDaysAhead, 1, 365, 60),
    slotStepMin: (SLOT_STEPS as readonly number[]).includes(step) ? step : 30,
    cancelCutoffHours: num(c.cancelCutoffHours, 0, 168, 24),
    timeZone: tz && isValidTimeZone(tz) ? tz : fallbackTimeZone,
    locationNote: str(c.locationNote, 200),
  };
}

// ── slots ────────────────────────────────────────────────────────────────────

/**
 * Bookable start times for `service` whose local date (business time zone)
 * falls in [fromDate, fromDate + days), honouring hours, days off, notice,
 * horizon, and existing bookings (busy ranges already include buffers).
 */
export function generateSlots(
  setup: BookingSetup,
  service: BookingService,
  fromDate: string,
  days: number,
  busy: Busy[],
  now: Date,
): Date[] {
  const tz = setup.timeZone;
  const earliest = now.getTime() + setup.minNoticeHours * 3600e3;
  const latest = now.getTime() + setup.maxDaysAhead * 86400e3;
  const off = new Set(setup.daysOff);
  const out: Date[] = [];
  const busySorted = [...busy].sort((a, b) => a.start.getTime() - b.start.getTime());
  const block = (service.durationMin + service.bufferMin) * 60000;

  for (let i = 0; i < Math.min(days, 62); i++) {
    const date = addDays(fromDate, i);
    if (off.has(date)) continue;
    const [y, m, d] = date.split("-").map(Number);
    for (const w of setup.weekly[weekdayOf(date)] ?? []) {
      const winStart = toMinutes(w.start);
      const winEnd = toMinutes(w.end);
      for (let t = winStart; t + service.durationMin <= winEnd; t += setup.slotStepMin) {
        const start = zonedTime(y, m, d, Math.floor(t / 60), t % 60, tz);
        if (!start) continue; // skipped by a DST jump
        const s = start.getTime();
        if (s < earliest || s > latest) continue;
        const e = s + block;
        const clash = busySorted.some((b) => b.start.getTime() < e && s < b.end.getTime());
        if (!clash) out.push(start);
      }
    }
  }
  return out.sort((a, b) => a.getTime() - b.getTime());
}

/** Server-side re-check of one requested start (same rules as generateSlots). */
export function isSlotAvailable(setup: BookingSetup, service: BookingService, start: Date, busy: Busy[], now: Date): boolean {
  if (Number.isNaN(start.getTime())) return false;
  const date = localDate(start, setup.timeZone);
  return generateSlots(setup, service, date, 1, busy, now).some((s) => s.getTime() === start.getTime());
}

export function canChange(setup: BookingSetup, startsAt: Date, now: Date): boolean {
  return startsAt.getTime() - now.getTime() >= setup.cancelCutoffHours * 3600e3;
}

// ── display ──────────────────────────────────────────────────────────────────

export function formatWhen(d: Date, tz: string, withZone = true): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    ...(withZone ? { timeZoneName: "short" } : {}),
  }).format(d);
}

export function formatTime(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(d);
}

/** "When" text for emails and the dashboard: business time, plus the customer's if different. */
export function whenText(start: Date, setup: BookingSetup, customerTz: string | null): string {
  const main = formatWhen(start, setup.timeZone);
  if (customerTz && isValidTimeZone(customerTz) && offsetMinutes(start, customerTz) !== offsetMinutes(start, setup.timeZone)) {
    return `${main} (${formatTime(start, customerTz)} your time)`;
  }
  return main;
}

export function bookingFieldDefs(): { id: string; label: string }[] {
  return [
    { id: `${BOOKING_KEY_PREFIX}when`, label: "When" },
    { id: `${BOOKING_KEY_PREFIX}service`, label: "Service" },
    { id: `${BOOKING_KEY_PREFIX}manage`, label: "Change or cancel" },
  ];
}

export function bookingValues(input: { whenText: string; service: BookingService; manageUrl: string; locationNote: string }): Record<string, string> {
  const service = `${input.service.name} (${input.service.durationMin} min)${input.service.priceLabel ? ` · ${input.service.priceLabel}` : ""}`;
  return {
    [`${BOOKING_KEY_PREFIX}when`]: input.whenText,
    [`${BOOKING_KEY_PREFIX}service`]: input.locationNote ? `${service} · ${input.locationNote}` : service,
    [`${BOOKING_KEY_PREFIX}manage`]: input.manageUrl,
  };
}

/** An .ics calendar file for one booking. */
export function icsFor(input: { uid: string; start: Date; end: Date; title: string; description: string; location: string }): string {
  const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//VisionWorkx//Booking//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${input.uid}@modules.revalorllc.com`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(input.start)}`,
    `DTEND:${stamp(input.end)}`,
    `SUMMARY:${esc(input.title)}`,
    `DESCRIPTION:${esc(input.description)}`,
    ...(input.location ? [`LOCATION:${esc(input.location)}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}

export const DEFAULT_BOOKING: BookingSetup = {
  services: [
    { id: "consultation", name: "Consultation", durationMin: 30, bufferMin: 10, priceLabel: "Free", description: "A quick call to talk through what you need." },
    { id: "appointment", name: "Appointment", durationMin: 60, bufferMin: 15, priceLabel: "", description: "" },
  ],
  weekly: [
    [],
    [{ start: "09:00", end: "17:00" }],
    [{ start: "09:00", end: "17:00" }],
    [{ start: "09:00", end: "17:00" }],
    [{ start: "09:00", end: "17:00" }],
    [{ start: "09:00", end: "15:00" }],
    [],
  ],
  daysOff: [],
  minNoticeHours: 12,
  maxDaysAhead: 60,
  slotStepMin: 30,
  cancelCutoffHours: 24,
  timeZone: "America/New_York",
  locationNote: "",
};
