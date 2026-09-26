"use client";

import { SLOT_STEPS, WEEKDAYS, type BookingService, type BookingSetup, type TimeWindow } from "@/lib/modules/booking";

// Owner-side editor for a booking module (used by FormBuilder): services,
// weekly hours, days off and booking rules.

const input = "mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy/20";
const small = "text-xs font-semibold text-gray-600";
const COMMON_ZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/Puerto_Rico",
  "Europe/London",
  "Europe/Paris",
  "Australia/Sydney",
];

function newId(name: string, taken: Set<string>): string {
  let base = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 32) || "service";
  if (!/^[a-z]/.test(base)) base = `s_${base}`;
  let id = base;
  for (let i = 2; taken.has(id); i++) id = `${base}_${i}`;
  return id;
}
function int(v: string, lo: number, hi: number, fallback: number): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
}

export default function BookingSetupEditor(props: { value: BookingSetup; onChange: (next: BookingSetup) => void }) {
  const b = props.value;
  const set = (patch: Partial<BookingSetup>) => props.onChange({ ...b, ...patch });
  const setService = (i: number, patch: Partial<BookingService>) => set({ services: b.services.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const setDay = (day: number, windows: TimeWindow[]) => set({ weekly: b.weekly.map((w, j) => (j === day ? windows : w)) });
  const zones = COMMON_ZONES.includes(b.timeZone) ? COMMON_ZONES : [b.timeZone, ...COMMON_ZONES];

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-bold text-gray-900">Services</h3>
        <ol className="mt-2 space-y-3">
          {b.services.map((s, i) => (
            <li key={s.id} className="rounded-xl border border-gray-200 p-3">
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_120px]">
                <label className={small} htmlFor={`bs-name-${i}`}>
                  Service name
                  <input id={`bs-name-${i}`} className={input} value={s.name} maxLength={80} onChange={(e) => setService(i, { name: e.target.value })} />
                </label>
                <label className={small} htmlFor={`bs-price-${i}`}>
                  Price <span className="font-normal text-gray-500">(shown as typed)</span>
                  <input id={`bs-price-${i}`} className={input} value={s.priceLabel} maxLength={30} placeholder="$150 or Free" onChange={(e) => setService(i, { priceLabel: e.target.value })} />
                </label>
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <label className={small} htmlFor={`bs-dur-${i}`}>
                  Length (minutes)
                  <input id={`bs-dur-${i}`} type="number" min={5} max={480} step={5} className={input} value={s.durationMin} onChange={(e) => setService(i, { durationMin: int(e.target.value, 5, 480, s.durationMin) })} />
                </label>
                <label className={small} htmlFor={`bs-buf-${i}`}>
                  Break after (minutes)
                  <input id={`bs-buf-${i}`} type="number" min={0} max={240} step={5} className={input} value={s.bufferMin} onChange={(e) => setService(i, { bufferMin: int(e.target.value, 0, 240, s.bufferMin) })} />
                </label>
              </div>
              <label className={`${small} mt-2 block`} htmlFor={`bs-desc-${i}`}>
                Short description <span className="font-normal text-gray-500">(optional)</span>
                <input id={`bs-desc-${i}`} className={input} value={s.description} maxLength={200} onChange={(e) => setService(i, { description: e.target.value })} />
              </label>
              <div className="mt-2 text-right">
                <button
                  type="button"
                  onClick={() => set({ services: b.services.filter((_, j) => j !== i) })}
                  disabled={b.services.length <= 1}
                  aria-label={`Remove "${s.name}"`}
                  className="rounded-lg border border-red-200 px-2 py-1 text-sm text-red-600 disabled:opacity-30"
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ol>
        {b.services.length < 20 && (
          <button
            type="button"
            onClick={() =>
              set({ services: [...b.services, { id: newId("new service", new Set(b.services.map((s) => s.id))), name: "New service", durationMin: 30, bufferMin: 0, priceLabel: "", description: "" }] })
            }
            className="mt-2 text-sm font-semibold text-navy hover:underline"
          >
            + Add a service
          </button>
        )}
      </div>

      <div>
        <h3 className="text-sm font-bold text-gray-900">When you&apos;re available</h3>
        <div className="mt-2 space-y-2">
          {WEEKDAYS.map((name, day) => {
            const windows = b.weekly[day] ?? [];
            const open = windows.length > 0;
            return (
              <div key={name} className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-100 px-3 py-2">
                <label className="flex w-32 items-center gap-2 text-sm font-semibold text-gray-700" htmlFor={`bd-${day}`}>
                  <input id={`bd-${day}`} type="checkbox" checked={open} onChange={(e) => setDay(day, e.target.checked ? [{ start: "09:00", end: "17:00" }] : [])} />
                  {name}
                </label>
                {!open && <span className="text-sm text-gray-400">Closed</span>}
                {windows.map((w, k) => (
                  <span key={k} className="flex items-center gap-1 text-sm">
                    <input
                      type="time"
                      aria-label={`${name} opens`}
                      className="rounded-lg border border-gray-300 px-2 py-1"
                      value={w.start}
                      onChange={(e) => setDay(day, windows.map((x, j) => (j === k ? { ...x, start: e.target.value } : x)))}
                    />
                    –
                    <input
                      type="time"
                      aria-label={`${name} closes`}
                      className="rounded-lg border border-gray-300 px-2 py-1"
                      value={w.end}
                      onChange={(e) => setDay(day, windows.map((x, j) => (j === k ? { ...x, end: e.target.value } : x)))}
                    />
                    {windows.length > 1 && (
                      <button type="button" aria-label={`Remove ${name} hours ${w.start}–${w.end}`} className="px-1 text-red-600" onClick={() => setDay(day, windows.filter((_, j) => j !== k))}>
                        ×
                      </button>
                    )}
                  </span>
                ))}
                {open && windows.length < 4 && (
                  <button type="button" className="text-xs font-semibold text-navy hover:underline" onClick={() => setDay(day, [...windows, { start: "13:00", end: "17:00" }])}>
                    + hours
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <p className="mt-1 text-xs text-gray-500">Add a second set of hours for a lunch break (e.g. 9:00–12:00 and 13:00–17:00).</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-semibold text-gray-700" htmlFor="bk-tz">
          Your time zone
          <select id="bk-tz" className={input} value={b.timeZone} onChange={(e) => set({ timeZone: e.target.value })}>
            {zones.map((z) => (
              <option key={z} value={z}>
                {z.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-semibold text-gray-700" htmlFor="bk-step">
          Start times every
          <select id="bk-step" className={input} value={b.slotStepMin} onChange={(e) => set({ slotStepMin: Number(e.target.value) })}>
            {SLOT_STEPS.map((m) => (
              <option key={m} value={m}>
                {m} minutes
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-semibold text-gray-700" htmlFor="bk-notice">
          Minimum notice (hours)
          <input id="bk-notice" type="number" min={0} max={720} className={input} value={b.minNoticeHours} onChange={(e) => set({ minNoticeHours: int(e.target.value, 0, 720, b.minNoticeHours) })} />
        </label>
        <label className="block text-sm font-semibold text-gray-700" htmlFor="bk-ahead">
          Book up to (days ahead)
          <input id="bk-ahead" type="number" min={1} max={365} className={input} value={b.maxDaysAhead} onChange={(e) => set({ maxDaysAhead: int(e.target.value, 1, 365, b.maxDaysAhead) })} />
        </label>
        <label className="block text-sm font-semibold text-gray-700" htmlFor="bk-cutoff">
          Customers can change until (hours before)
          <input id="bk-cutoff" type="number" min={0} max={168} className={input} value={b.cancelCutoffHours} onChange={(e) => set({ cancelCutoffHours: int(e.target.value, 0, 168, b.cancelCutoffHours) })} />
        </label>
        <label className="block text-sm font-semibold text-gray-700" htmlFor="bk-loc">
          Where <span className="font-normal text-gray-500">(shown in emails)</span>
          <input id="bk-loc" className={input} value={b.locationNote} maxLength={200} placeholder="Video call — link by email / 123 Main St" onChange={(e) => set({ locationNote: e.target.value })} />
        </label>
      </div>

      <div>
        <label className="block text-sm font-semibold text-gray-700" htmlFor="bk-off">
          Days off <span className="font-normal text-gray-500">(holidays, vacation)</span>
        </label>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <input
            id="bk-off"
            type="date"
            className="rounded-lg border border-gray-300 px-2 py-1 text-sm"
            onChange={(e) => {
              const d = e.target.value;
              if (d && !b.daysOff.includes(d)) set({ daysOff: [...b.daysOff, d].sort() });
              e.target.value = "";
            }}
          />
          {b.daysOff.map((d) => (
            <span key={d} className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
              {d}
              <button type="button" aria-label={`Remove day off ${d}`} onClick={() => set({ daysOff: b.daysOff.filter((x) => x !== d) })}>
                ×
              </button>
            </span>
          ))}
        </div>
      </div>
      <p className="text-xs text-gray-500">Customers get a confirmation right away and a reminder 24 hours before. Google and Outlook calendar sync is coming soon.</p>
    </div>
  );
}
