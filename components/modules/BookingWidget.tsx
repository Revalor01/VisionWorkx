"use client";

import { useEffect, useMemo, useState } from "react";
import { generateSlots, localDate, type BookingService, type BookingSetup } from "@/lib/modules/booking";

// Visitor-side booking steps, rendered inside ModuleForm (brand CSS variables)
// and on the manage page (reschedule). Times are shown in the visitor's own
// time zone; the business's zone is noted when it differs.

export function visitorTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function ServicePicker(props: { services: BookingService[]; value: string | null; onChange: (id: string) => void }) {
  return (
    <fieldset className="vwm-b-services">
      <legend>Choose a service</legend>
      {props.services.map((s) => {
        const on = props.value === s.id;
        return (
          <label key={s.id} className={on ? "is-on" : ""}>
            <input type="radio" name="vwm-b-service" checked={on} onChange={() => props.onChange(s.id)} />
            <span className="vwm-b-sname">
              {s.name}
              {s.priceLabel && <b>{s.priceLabel}</b>}
            </span>
            <span className="vwm-b-smeta">
              {s.durationMin} min{s.description ? ` · ${s.description}` : ""}
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}

type Loaded = { status: "loading" } | { status: "error"; message: string } | { status: "ok"; slots: Date[] };

export function TimePicker(props: {
  publicId: string;
  setup: BookingSetup;
  service: BookingService;
  value: string | null;
  onChange: (iso: string) => void;
  /** Builder preview: compute times locally (nothing is published yet, no bookings). */
  preview?: boolean;
  /** Reschedule: ask the manage API (which ignores the customer's own booking) instead of the public slots API. */
  slotsUrl?: (from: string) => string;
}) {
  const { setup, service } = props;
  const tz = useMemo(visitorTimeZone, []);
  const today = useMemo(() => localDate(new Date(), setup.timeZone), [setup.timeZone]);
  const [from, setFrom] = useState(today);
  const [loaded, setLoaded] = useState<Loaded>({ status: "loading" });
  const [day, setDay] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoaded({ status: "loading" });
    setDay(null);
    if (props.preview) {
      setLoaded({ status: "ok", slots: generateSlots(setup, service, from, 7, [], new Date()) });
      return;
    }
    const url = props.slotsUrl ? props.slotsUrl(from) : `/api/m/${props.publicId}/slots?service=${encodeURIComponent(service.id)}&from=${from}&days=7`;
    fetch(url)
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body.error || "Couldn't load open times.");
        return (body.slots as string[]).map((s) => new Date(s));
      })
      .then((slots) => !cancelled && setLoaded({ status: "ok", slots }))
      .catch((e) => !cancelled && setLoaded({ status: "error", message: e instanceof Error ? e.message : "Couldn't load open times." }));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, service.id, props.publicId, props.preview]);

  const byDay = useMemo(() => {
    const map = new Map<string, Date[]>();
    if (loaded.status === "ok") for (const s of loaded.slots) map.set(localDate(s, tz), [...(map.get(localDate(s, tz)) ?? []), s]);
    return map;
  }, [loaded, tz]);
  const days = [...byDay.keys()].sort();
  const activeDay = day && byDay.has(day) ? day : (days[0] ?? null);
  const dayLabel = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric" });
  const timeLabel = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" });
  const maxFrom = addDays(today, Math.max(0, setup.maxDaysAhead - 1));
  const tzName = tz.replace(/_/g, " ");

  return (
    <div className="vwm-b-time">
      <div className="vwm-b-weeknav">
        <button type="button" className="vwm-link" disabled={from <= today} onClick={() => setFrom(addDays(from, -7) < today ? today : addDays(from, -7))}>
          ← Earlier
        </button>
        <span aria-live="polite">
          {dayLabel.format(new Date(`${from}T12:00:00Z`))} – {dayLabel.format(new Date(`${addDays(from, 6)}T12:00:00Z`))}
        </span>
        <button type="button" className="vwm-link" disabled={addDays(from, 7) > maxFrom} onClick={() => setFrom(addDays(from, 7))}>
          Later →
        </button>
      </div>

      {loaded.status === "loading" && <p className="vwm-b-note" role="status">Finding open times…</p>}
      {loaded.status === "error" && (
        <p className="vwm-err" role="alert">
          {loaded.message}
        </p>
      )}
      {loaded.status === "ok" && days.length === 0 && <p className="vwm-b-note">No open times this week — try later dates.</p>}

      {days.length > 0 && (
        <>
          <div className="vwm-b-days" role="group" aria-label="Day">
            {days.map((d) => (
              <button
                key={d}
                type="button"
                aria-pressed={d === activeDay}
                className={d === activeDay ? "is-on" : ""}
                onClick={() => setDay(d)}
              >
                {dayLabel.format(byDay.get(d)![0])}
                <em>{byDay.get(d)!.length} open</em>
              </button>
            ))}
          </div>
          <div className="vwm-b-slots" role="group" aria-label="Time">
            {(activeDay ? byDay.get(activeDay)! : []).map((s) => {
              const iso = s.toISOString();
              return (
                <button key={iso} type="button" aria-pressed={props.value === iso} className={props.value === iso ? "is-on" : ""} onClick={() => props.onChange(iso)}>
                  {timeLabel.format(s)}
                </button>
              );
            })}
          </div>
        </>
      )}
      <p className="vwm-b-note">
        Times are in your time zone ({tzName}).
        {tz !== setup.timeZone ? ` The business is in ${setup.timeZone.replace(/_/g, " ")}.` : ""}
      </p>
    </div>
  );
}

export const BOOKING_CSS = `
.vwm-b-services{border:0;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.vwm-b-services legend,.vwm-b-h{font-size:14px;font-weight:600;color:#39404f;padding:0;margin-bottom:8px}
.vwm-b-services label{position:relative;display:flex;flex-direction:column;gap:2px;padding:12px 14px;border:1px solid #cfd4de;border-radius:calc(var(--vw-r)*.8);background:#fbfbfd;cursor:pointer}
.vwm-b-services input{position:absolute;opacity:0;width:1px;height:1px}
.vwm-b-services label.is-on{border-color:var(--vw-b);background:var(--vw-soft)}
.vwm-b-services label:focus-within{outline:2px solid var(--vw-b);outline-offset:2px}
.vwm-b-sname{display:flex;justify-content:space-between;gap:8px;font-weight:600;color:#1f2533;font-size:15px}
.vwm-b-sname b{font-weight:600;color:#39404f}
.vwm-b-smeta{font-size:13px;color:#5f6778}
.vwm-b-time{display:flex;flex-direction:column;gap:12px}
.vwm-b-weeknav{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:14px;color:#1f2533;font-weight:600}
.vwm-b-weeknav .vwm-link:disabled{opacity:.35;cursor:default}
.vwm-b-days{display:flex;gap:8px;overflow-x:auto;padding-bottom:2px}
.vwm-b-days button{flex:none;display:flex;flex-direction:column;align-items:center;gap:2px;min-width:84px;padding:8px 10px;border:1px solid #cfd4de;border-radius:calc(var(--vw-r)*.7);background:#fbfbfd;font:600 13px var(--vw-font);color:#1f2533;cursor:pointer}
.vwm-b-days button em{font-style:normal;font-weight:400;font-size:12px;color:#5f6778}
.vwm-b-slots{display:grid;grid-template-columns:repeat(auto-fill,minmax(92px,1fr));gap:8px}
.vwm-b-slots button{min-height:42px;border:1px solid #cfd4de;border-radius:calc(var(--vw-r)*.7);background:#fbfbfd;font:600 14px var(--vw-font);color:#1f2533;cursor:pointer;font-variant-numeric:tabular-nums}
.vwm-b-days button.is-on,.vwm-b-slots button.is-on{border-color:var(--vw-b);background:var(--vw-b);color:var(--vw-ink)}
.vwm-b-days button.is-on em{color:inherit;opacity:.85}
.vwm-b-days button:focus-visible,.vwm-b-slots button:focus-visible{outline:2px solid var(--vw-b);outline-offset:2px}
.vwm-b-note{margin:0;font-size:12.5px;color:#5f6778}
.vwm-b-summary{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 14px;margin:0 0 14px;border-radius:calc(var(--vw-r)*.8);background:var(--vw-soft);font-size:14px;color:#39404f}
.vwm-b-summary strong{color:#141925}
.vwm-link{background:none;border:0;padding:4px 0;font:600 14px var(--vw-font);color:#39404f;text-decoration:underline;cursor:pointer}
.vwm-link:focus-visible{outline:2px solid var(--vw-b);outline-offset:2px}
.vwm-row{display:flex;gap:10px;margin-top:18px}
.vwm-row .vwm-btn{margin-top:0}
.vwm-btn.ghost{background:#fff;color:#39404f;border:1px solid #cfd4de;flex:0 0 auto;width:auto}
`;
