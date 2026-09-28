"use client";

import { useState } from "react";
import { useNow } from "@/lib/hooks";

export interface BookingRow {
  id: string;
  serviceName: string;
  startsAt: string;
  endsAt: string;
  status: string;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string;
}

export default function BookingsList(props: { slug: string; timeZone: string; initial: BookingRow[]; canCancel: boolean }) {
  const [rows, setRows] = useState(props.initial);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const day = new Intl.DateTimeFormat("en-US", { timeZone: props.timeZone, weekday: "long", month: "long", day: "numeric" });
  const time = new Intl.DateTimeFormat("en-US", { timeZone: props.timeZone, hour: "numeric", minute: "2-digit" });
  const now = useNow();
  const upcoming = rows.filter((r) => r.status === "confirmed" && new Date(r.endsAt).getTime() >= now);
  const groups = new Map<string, BookingRow[]>();
  for (const r of upcoming) {
    const k = day.format(new Date(r.startsAt));
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  const cancelled = rows.filter((r) => r.status === "cancelled");

  async function cancel(id: string) {
    setBusy(true);
    setMsg("");
    const res = await fetch(`/api/workspace/${props.slug}/bookings/${id}`, { method: "POST" }).catch(() => null);
    const body = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    setConfirming(null);
    if (res?.ok) {
      setRows((rs) => rs.map((r) => (r.id === id ? { ...r, status: "cancelled" } : r)));
      setMsg("Booking cancelled. We emailed your customer to let them know.");
    } else setMsg(body.error || "Couldn't cancel — try again.");
  }

  return (
    <div className="space-y-6">
      {msg && (
        <p role="status" className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800">
          {msg}
        </p>
      )}
      {upcoming.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-gray-600">No upcoming bookings yet.</div>
      ) : (
        [...groups.entries()].map(([label, list]) => (
          <section key={label} aria-label={label} className="rounded-2xl border border-gray-200 bg-white">
            <h2 className="border-b border-gray-100 px-5 py-3 text-sm font-bold text-navy-dark">{label}</h2>
            <ul className="divide-y divide-gray-100">
              {list.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900">
                      <span className="tabular-nums">{time.format(new Date(r.startsAt))}–{time.format(new Date(r.endsAt))}</span> · {r.serviceName}
                    </p>
                    <p className="truncate text-sm text-gray-600">
                      {r.customerName || "Customer"}
                      {r.customerEmail ? ` · ${r.customerEmail}` : ""}
                      {r.customerPhone ? ` · ${r.customerPhone}` : ""}
                    </p>
                  </div>
                  {props.canCancel &&
                    (confirming === r.id ? (
                      <span className="flex items-center gap-2 text-sm">
                        <span className="text-gray-600">Cancel this booking?</span>
                        <button type="button" disabled={busy} onClick={() => cancel(r.id)} className="rounded-lg bg-red-600 px-3 py-1.5 font-semibold text-white disabled:opacity-60">
                          {busy ? "Cancelling…" : "Yes, cancel"}
                        </button>
                        <button type="button" onClick={() => setConfirming(null)} className="rounded-lg border px-3 py-1.5">
                          Keep
                        </button>
                      </span>
                    ) : (
                      <button type="button" onClick={() => setConfirming(r.id)} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
                        Cancel
                      </button>
                    ))}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
      {cancelled.length > 0 && (
        <details className="rounded-2xl border border-gray-200 bg-white px-5 py-3">
          <summary className="cursor-pointer text-sm font-semibold text-gray-700">Recently cancelled ({cancelled.length})</summary>
          <ul className="mt-2 space-y-1 text-sm text-gray-600">
            {cancelled.map((r) => (
              <li key={r.id}>
                {day.format(new Date(r.startsAt))}, {time.format(new Date(r.startsAt))} · {r.serviceName} · {r.customerName || r.customerEmail || "Customer"}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
