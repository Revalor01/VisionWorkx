"use client";

import { useMemo, useState } from "react";
import { modulesBrowserClient } from "@/lib/modules/supabase-browser";
import { SUBMISSION_STATUSES, type SubmissionStatus } from "@/lib/modules/constants";

type FileRef = { path: string; name: string; size: number; type: string };
type Value = string | FileRef;

export interface SubmissionRow {
  id: string;
  module_id: string;
  data: Record<string, Value>;
  status: SubmissionStatus;
  notes: string;
  source_url: string | null;
  created_at: string;
  payment_status: "none" | "pending" | "paid" | "failed";
  payment_amount_cents: number | null;
}

const PAYMENT_LABEL: Record<SubmissionRow["payment_status"], string> = { none: "", pending: "Payment sent", paid: "Paid", failed: "Payment failed" };
const PAYMENT_PILL: Record<SubmissionRow["payment_status"], string> = {
  none: "",
  pending: "bg-blue-50 text-blue-700 border-blue-200",
  paid: "bg-emerald-50 text-emerald-700 border-emerald-200",
  failed: "bg-red-50 text-red-700 border-red-200",
};
function fmtUsd(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

const LABEL: Record<SubmissionStatus, string> = { new: "New", contacted: "Contacted", won: "Won", lost: "Lost" };
const PILL: Record<SubmissionStatus, string> = {
  new: "bg-blue-50 text-blue-700 border-blue-200",
  contacted: "bg-amber-50 text-amber-800 border-amber-200",
  won: "bg-emerald-50 text-emerald-700 border-emerald-200",
  lost: "bg-gray-100 text-gray-600 border-gray-200",
};

const str = (v: Value | undefined) => (typeof v === "string" ? v : "");
function who(d: Record<string, Value>): string {
  return str(d.name) || str(d.full_name) || str(d.email) || "Submission";
}
function fmtSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export default function SubmissionsBoard(props: {
  workspaceId: string;
  slug: string;
  timeZone: string;
  moduleNames: Record<string, string>;
  fieldLabels?: Record<string, Record<string, string>>; // module id -> field id -> question
  initial: SubmissionRow[];
}) {
  const [rows, setRows] = useState(props.initial);
  const [filter, setFilter] = useState<SubmissionStatus | "all">("all");
  const [openId, setOpenId] = useState<string | null>(props.initial[0]?.id ?? null);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [invoiceAmount, setInvoiceAmount] = useState("");
  const [invoiceLabel, setInvoiceLabel] = useState("Payment");
  const [sendingInvoice, setSendingInvoice] = useState(false);
  const [invoiceMsg, setInvoiceMsg] = useState("");
  const supabase = modulesBrowserClient();

  async function sendPaymentLink(submissionId: string) {
    const dollars = Number(invoiceAmount);
    if (!Number.isFinite(dollars) || dollars < 0.5) {
      setInvoiceMsg("Enter an amount of at least $0.50.");
      return;
    }
    setSendingInvoice(true);
    setInvoiceMsg("");
    try {
      const res = await fetch(`/api/workspace/${props.slug}/submissions/${submissionId}/invoice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountCents: Math.round(dollars * 100), label: invoiceLabel }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Couldn't send the payment link.");
      setRows((rs) => rs.map((r) => (r.id === submissionId ? { ...r, payment_status: "pending", payment_amount_cents: Math.round(dollars * 100) } : r)));
      setInvoiceMsg("Payment link sent.");
      setInvoiceAmount("");
    } catch (e) {
      setInvoiceMsg(e instanceof Error ? e.message : "Couldn't send the payment link.");
    } finally {
      setSendingInvoice(false);
    }
  }

  const fmt = useMemo(
    () => new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: props.timeZone }),
    [props.timeZone],
  );
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length };
    SUBMISSION_STATUSES.forEach((s) => (c[s] = rows.filter((r) => r.status === s).length));
    return c;
  }, [rows]);
  const visible = filter === "all" ? rows : rows.filter((r) => r.status === filter);
  const open = rows.find((r) => r.id === openId) ?? null;

  async function update(id: string, patch: Partial<Pick<SubmissionRow, "status" | "notes">>) {
    setSaving(id);
    setError("");
    const prev = rows;
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    const { error } = await supabase.from("vw_submissions").update(patch).eq("id", id);
    setSaving(null);
    if (error) {
      setRows(prev);
      setError("Couldn't save that change. Check your connection and try again.");
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy-dark">Submissions</h1>
          <p className="text-sm text-gray-500">Everything your modules collect, newest first.</p>
        </div>
        <a
          href={`/api/workspace/${props.slug}/export`}
          className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
        >
          Export CSV
        </a>
      </div>

      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filter by status">
        {(["all", ...SUBMISSION_STATUSES] as const).map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={filter === s}
            onClick={() => setFilter(s)}
            className={`rounded-full border px-3 py-1.5 text-sm font-medium ${
              filter === s ? "border-navy bg-navy text-white" : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
            }`}
          >
            {s === "all" ? "All" : LABEL[s]} <span className="opacity-70 tabular-nums">{counts[s]}</span>
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center text-gray-600">
          No submissions yet. Once a module is installed on your website, new entries appear here.
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Customer</th>
                  <th className="px-4 py-3 font-semibold">Module</th>
                  <th className="px-4 py-3 font-semibold">Received</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => setOpenId(r.id)}
                    className={`cursor-pointer border-t border-gray-100 ${openId === r.id ? "bg-blue-50/50" : "hover:bg-gray-50"}`}
                  >
                    <td className="px-4 py-3">
                      <button type="button" className="text-left font-semibold text-gray-900 hover:underline" onClick={() => setOpenId(r.id)}>
                        {who(r.data)}
                      </button>
                      {str(r.data.email) && str(r.data.email) !== who(r.data) && <div className="text-xs text-gray-500">{str(r.data.email)}</div>}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{props.moduleNames[r.module_id] ?? "Module"}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-600 tabular-nums">{fmt.format(new Date(r.created_at))}</td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <label className="sr-only" htmlFor={`st-${r.id}`}>Status for {who(r.data)}</label>
                      <select
                        id={`st-${r.id}`}
                        value={r.status}
                        disabled={saving === r.id}
                        onChange={(e) => update(r.id, { status: e.target.value as SubmissionStatus })}
                        className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${PILL[r.status]}`}
                      >
                        {SUBMISSION_STATUSES.map((s) => (
                          <option key={s} value={s}>{LABEL[s]}</option>
                        ))}
                      </select>
                      {r.payment_status !== "none" && (
                        <span className={`ml-1.5 rounded-full border px-2 py-1 text-xs font-semibold ${PAYMENT_PILL[r.payment_status]}`}>
                          {PAYMENT_LABEL[r.payment_status]}
                          {r.payment_amount_cents ? ` · ${fmtUsd(r.payment_amount_cents)}` : ""}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {open && (
            <aside className="rounded-2xl border border-gray-200 bg-white p-5" aria-label="Submission details">
              <h2 className="text-lg font-bold text-navy-dark">{who(open.data)}</h2>
              <p className="mb-4 text-xs text-gray-500">
                {props.moduleNames[open.module_id] ?? "Module"} · {fmt.format(new Date(open.created_at))}
              </p>
              <dl className="mb-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                {Object.entries(open.data).map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-gray-500">{props.fieldLabels?.[open.module_id]?.[k] ?? k.replace(/_/g, " ")}</dt>
                    <dd className="break-words text-gray-900 whitespace-pre-wrap">
                      {typeof v === "string" ? (
                        v
                      ) : (
                        <a
                          href={`/api/workspace/${props.slug}/file?submission=${open.id}&field=${encodeURIComponent(k)}`}
                          className="font-semibold text-navy hover:underline"
                        >
                          📎 {v.name} ({fmtSize(v.size)})
                        </a>
                      )}
                    </dd>
                  </div>
                ))}
                {open.source_url && (
                  <div className="contents">
                    <dt className="text-gray-500">page</dt>
                    <dd className="break-all text-gray-600">{open.source_url}</dd>
                  </div>
                )}
              </dl>
              <label htmlFor="sub-notes" className="block text-sm font-semibold text-gray-700">
                Notes
              </label>
              <textarea
                id="sub-notes"
                key={open.id}
                defaultValue={open.notes}
                maxLength={5000}
                rows={4}
                onBlur={(e) => e.target.value !== open.notes && update(open.id, { notes: e.target.value })}
                placeholder="Called back, left a voicemail…"
                className="mt-1.5 w-full rounded-xl border border-gray-300 p-3 text-sm focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy/20"
              />
              <p className="mt-1 text-xs text-gray-500">{saving === open.id ? "Saving…" : "Saves when you click away."}</p>

              <div className="mt-5 border-t border-gray-100 pt-4">
                <h3 className="text-sm font-semibold text-gray-700">Payment</h3>
                {open.payment_status !== "none" ? (
                  <p className="mt-1.5 text-sm text-gray-600">
                    {PAYMENT_LABEL[open.payment_status]}
                    {open.payment_amount_cents ? ` — ${fmtUsd(open.payment_amount_cents)}` : ""}
                  </p>
                ) : str(open.data.email) ? (
                  <div className="mt-2 flex flex-wrap items-end gap-2">
                    <label className="text-xs font-medium text-gray-600" htmlFor="inv-label">
                      What for
                      <input id="inv-label" value={invoiceLabel} maxLength={60} onChange={(e) => setInvoiceLabel(e.target.value)} className="mt-1 block w-32 rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
                    </label>
                    <label className="text-xs font-medium text-gray-600" htmlFor="inv-amount">
                      Amount
                      <input id="inv-amount" type="number" min="0.5" step="0.01" placeholder="50.00" value={invoiceAmount} onChange={(e) => setInvoiceAmount(e.target.value)} className="mt-1 block w-24 rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
                    </label>
                    <button
                      type="button"
                      onClick={() => sendPaymentLink(open.id)}
                      disabled={sendingInvoice}
                      className="rounded-lg bg-navy-dark px-3 py-1.5 text-sm font-semibold text-white hover:bg-navy disabled:opacity-60"
                    >
                      {sendingInvoice ? "Sending…" : "Send payment link"}
                    </button>
                  </div>
                ) : (
                  <p className="mt-1.5 text-sm text-gray-500">No email on this submission to send a payment link to.</p>
                )}
                {invoiceMsg && <p className="mt-1.5 text-xs text-gray-500">{invoiceMsg}</p>}
              </div>
            </aside>
          )}
        </div>
      )}
    </div>
  );
}
