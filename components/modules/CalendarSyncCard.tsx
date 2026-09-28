"use client";

import { useState } from "react";

const OUTCOMES: Record<string, { ok: boolean; text: string }> = {
  connected: { ok: true, text: "Google Calendar connected." },
  cancelled: { ok: false, text: "Nothing changed — you cancelled on Google's screen." },
  missing_scopes: {
    ok: false,
    text: "Google Calendar wasn't connected: both permissions are needed (see your busy times, and add bookings to your calendar). Try again and leave both ticked.",
  },
  expired: { ok: false, text: "That took too long or you signed out part-way. Please try again." },
  unavailable: { ok: false, text: "Calendar sync isn't available yet. Please try again later." },
  error: { ok: false, text: "Couldn't connect Google Calendar. Please try again." },
};

export default function CalendarSyncCard({
  slug,
  initial,
  outcome,
}: {
  slug: string;
  initial: { status: "none" | "active" | "error"; accountEmail: string | null; lastError: string | null };
  /** ?calendar=<outcome> after returning from Google. */
  outcome?: string;
}) {
  const [status, setStatus] = useState(initial.status);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState(outcome ? OUTCOMES[outcome] : undefined);
  const connectHref = `/api/workspace/${slug}/calendar/google/connect`;

  async function disconnect() {
    if (working) return;
    setWorking(true);
    setError("");
    setFlash(undefined);
    try {
      const res = await fetch(`/api/workspace/${slug}/calendar/google/disconnect`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Couldn't disconnect — try again.");
        return;
      }
      setStatus("none");
    } catch {
      setError("Network error — try again.");
    } finally {
      setWorking(false);
    }
  }

  const button = "mt-3 inline-block rounded-xl px-5 py-2.5 text-sm font-semibold";

  return (
    <section className="max-w-2xl rounded-2xl border border-gray-200 bg-white p-6" aria-labelledby="cal-h">
      <h2 id="cal-h" className="font-bold text-gray-900">Calendar sync</h2>
      <p className="mt-1 text-sm text-gray-500">
        Connect Google Calendar so your booking pages hide times you&apos;re already busy, and every new booking shows up on your
        calendar (moved or removed when a customer reschedules or cancels). We only see when you&apos;re busy — never your event
        details.
      </p>

      {flash && (
        <p role="status" className={`mt-3 rounded-lg px-3 py-2 text-sm ${flash.ok ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>
          {flash.text}
        </p>
      )}

      {status === "active" ? (
        <>
          <p className="mt-3 text-sm text-emerald-700">
            ✓ Connected{initial.accountEmail ? <> as <strong>{initial.accountEmail}</strong></> : null} (primary calendar).
          </p>
          <button
            type="button"
            onClick={disconnect}
            disabled={working}
            className={`${button} border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-60`}
          >
            {working ? "Disconnecting…" : "Disconnect"}
          </button>
        </>
      ) : status === "error" ? (
        <>
          <p className="mt-3 text-sm text-amber-800">{initial.lastError ?? "Google Calendar stopped responding."} Bookings still work, but your calendar isn&apos;t syncing.</p>
          <a href={connectHref} className={`${button} bg-navy-dark text-white hover:bg-navy`}>Reconnect Google Calendar</a>
        </>
      ) : (
        <a href={connectHref} className={`${button} bg-navy-dark text-white hover:bg-navy`}>Connect Google Calendar</a>
      )}
      <p className="mt-3 text-xs text-gray-400">Outlook calendar sync is coming soon.</p>

      {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
    </section>
  );
}
