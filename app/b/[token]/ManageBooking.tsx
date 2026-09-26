"use client";

import { useState } from "react";
import type { Brand } from "@/lib/modules/config";
import type { BookingService, BookingSetup } from "@/lib/modules/booking";
import { BOOKING_CSS, TimePicker, visitorTimeZone } from "@/components/modules/BookingWidget";

const FONTS: Record<Brand["font"], string> = {
  modern: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  classic: 'Georgia, "Times New Roman", serif',
  friendly: '"Nunito", ui-rounded, "SF Pro Rounded", system-ui, sans-serif',
};

function inkFor(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45 ? "#141925" : "#ffffff";
}

export default function ManageBooking(props: {
  token: string;
  businessName: string;
  logoUrl: string | null;
  brand: Brand;
  setup: BookingSetup;
  service: BookingService | null;
  serviceName: string;
  startsAt: string;
  status: string;
  changeable: boolean;
  modulePublicId: string;
}) {
  const [mode, setMode] = useState<"view" | "reschedule" | "confirm-cancel">("view");
  const [status, setStatus] = useState(props.status);
  const [startsAt, setStartsAt] = useState(props.startsAt);
  const [pick, setPick] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const tz = visitorTimeZone();
  const when = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(startsAt));
  // Recomputed from the current start (not a server prop) so it follows a reschedule.
  const businessWhen = new Intl.DateTimeFormat("en-US", { timeZone: props.setup.timeZone, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(startsAt));

  async function act(body: object, okText: string) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/b/${props.token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Something went wrong — please try again.");
      setMsg({ kind: "ok", text: okText });
      return true;
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Something went wrong." });
      return false;
    } finally {
      setBusy(false);
    }
  }

  const vars = {
    "--vw-b": props.brand.color,
    "--vw-ink": inkFor(props.brand.color),
    "--vw-soft": `${props.brand.color}1f`,
    "--vw-r": `${props.brand.radius}px`,
    "--vw-font": FONTS[props.brand.font],
  } as React.CSSProperties;

  return (
    <main className="vwm-manage" style={vars}>
      <style>{BOOKING_CSS + MANAGE_CSS}</style>
      <div className="vwm-mcard">
        <header>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {props.logoUrl && <img src={props.logoUrl} alt={`${props.businessName} logo`} />}
          <div>
            <strong>{props.businessName}</strong>
            <span>Your booking</span>
          </div>
        </header>
        <div className="vwm-mbody">
          {status !== "confirmed" ? (
            <>
              <h1>This booking is cancelled</h1>
              <p className="vwm-muted">
                {props.serviceName} — {when}. Want a new time? Book again from {props.businessName}&apos;s website.
              </p>
            </>
          ) : (
            <>
              <h1>{props.serviceName}</h1>
              <p className="vwm-when">{when}</p>
              {tz !== props.setup.timeZone && <p className="vwm-muted">That&apos;s {businessWhen} for {props.businessName}.</p>}
              {props.setup.locationNote && <p className="vwm-muted">{props.setup.locationNote}</p>}

              {mode === "view" && (
                <>
                  <p>
                    <a className="vwm-cal" href={`/api/b/${props.token}/ics`}>
                      Add to my calendar
                    </a>
                  </p>
                  {props.changeable ? (
                    <div className="vwm-row">
                      {props.service && (
                        <button type="button" className="vwm-btn" onClick={() => setMode("reschedule")}>
                          Reschedule
                        </button>
                      )}
                      <button type="button" className="vwm-btn ghost" onClick={() => setMode("confirm-cancel")}>
                        Cancel booking
                      </button>
                    </div>
                  ) : (
                    <p className="vwm-muted">
                      Changes need at least {props.setup.cancelCutoffHours} hours&apos; notice. Please contact {props.businessName} directly.
                    </p>
                  )}
                </>
              )}

              {mode === "confirm-cancel" && (
                <div className="vwm-confirm" role="alertdialog" aria-labelledby="vwm-cc-h">
                  <p id="vwm-cc-h">Cancel this booking? The time will be released for someone else.</p>
                  <div className="vwm-row">
                    <button
                      type="button"
                      className="vwm-btn"
                      disabled={busy}
                      onClick={async () => {
                        if (await act({ action: "cancel" }, `Cancelled. ${props.businessName} has been told.`)) {
                          setStatus("cancelled");
                          setMode("view");
                        }
                      }}
                    >
                      {busy ? "Cancelling…" : "Yes, cancel it"}
                    </button>
                    <button type="button" className="vwm-btn ghost" onClick={() => setMode("view")}>
                      Keep it
                    </button>
                  </div>
                </div>
              )}

              {mode === "reschedule" && props.service && (
                <div className="vwm-resched">
                  <p className="vwm-b-h">Pick a new time</p>
                  <TimePicker
                    publicId={props.modulePublicId}
                    setup={props.setup}
                    service={props.service}
                    value={pick}
                    onChange={setPick}
                    slotsUrl={(from) => `/api/b/${props.token}/slots?from=${from}`}
                  />
                  <div className="vwm-row">
                    <button
                      type="button"
                      className="vwm-btn"
                      disabled={!pick || busy}
                      onClick={async () => {
                        if (pick && (await act({ action: "reschedule", start: pick }, `Moved. ${props.businessName} has been told, and your reminder will follow the new time.`))) {
                          setStartsAt(pick);
                          setPick(null);
                          setMode("view");
                        }
                      }}
                    >
                      {busy ? "Saving…" : "Move my booking"}
                    </button>
                    <button type="button" className="vwm-btn ghost" onClick={() => setMode("view")}>
                      Back
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
          {msg && (
            <p className={msg.kind === "ok" ? "vwm-ok" : "vwm-err"} role={msg.kind === "ok" ? "status" : "alert"}>
              {msg.text}
            </p>
          )}
        </div>
        <footer>Powered by VisionWorkx</footer>
      </div>
    </main>
  );
}

const MANAGE_CSS = `
body{margin:0;background:#f3f4f7}
.vwm-manage{font-family:var(--vw-font);color:#1f2533;padding:32px 16px;display:flex;justify-content:center}
.vwm-manage *{box-sizing:border-box}
.vwm-mcard{width:100%;max-width:560px;background:#fff;border:1px solid #e6e9ef;border-radius:var(--vw-r);overflow:hidden}
.vwm-mcard header{display:flex;align-items:center;gap:12px;padding:16px 20px;border-bottom:1px solid #eceef3}
.vwm-mcard header img{width:40px;height:40px;object-fit:contain}
.vwm-mcard header strong{display:block;font-size:16px}
.vwm-mcard header span{font-size:13px;color:#5f6778}
.vwm-mbody{padding:20px}
.vwm-mbody h1{font-size:22px;margin:0 0 6px}
.vwm-when{font-size:17px;font-weight:600;margin:0 0 6px}
.vwm-muted{color:#5f6778;font-size:14px;margin:0 0 6px}
.vwm-cal{color:#39404f;font-weight:600}
.vwm-btn{flex:1;min-height:46px;background:var(--vw-b);color:var(--vw-ink);border:0;border-radius:calc(var(--vw-r)*.8);padding:10px 16px;font:600 15px var(--vw-font);cursor:pointer}
.vwm-btn:disabled{opacity:.6;cursor:default}
.vwm-btn:focus-visible{outline:2px solid var(--vw-b);outline-offset:3px}
.vwm-confirm{margin-top:16px;padding:14px;border:1px solid #e6e9ef;border-radius:calc(var(--vw-r)*.8);background:#fafbfc}
.vwm-confirm p{margin:0}
.vwm-resched{margin-top:16px}
.vwm-ok{color:#1d7a4f;font-size:14px;margin:14px 0 0}
.vwm-err{color:#b02f2f;font-size:14px;margin:14px 0 0}
.vwm-mcard footer{padding:9px 20px;background:#f8f9fb;border-top:1px solid #eceef3;font-size:11.5px;color:#6f7789;text-align:right}
`;
