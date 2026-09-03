"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { DomainRecord, DomainStatus } from "@/lib/apps/domains";
import type { Plan } from "@/lib/database.types";

function RecordTable({ rows }: { rows: DomainRecord[] }) {
  return (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-gray-400">
            <th className="pr-4 pb-1 font-medium">Type</th>
            <th className="pr-4 pb-1 font-medium">Name</th>
            <th className="pb-1 font-medium">Value</th>
          </tr>
        </thead>
        <tbody className="font-mono text-navy-dark">
          {rows.map((r, i) => (
            <tr key={i}>
              <td className="pr-4 py-0.5">{r.type}</td>
              <td className="pr-4 py-0.5">{r.domain}</td>
              <td className="py-0.5 break-all">{r.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function DomainCard({
  appId,
  plan,
  initialDomain,
}: {
  appId: string;
  plan: Plan;
  initialDomain: string | null;
}) {
  const gated = plan !== "growth" && plan !== "pro";
  const [domain, setDomain] = useState<string | null>(initialDomain);
  const [status, setStatus] = useState<DomainStatus | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!domain) return;
    try {
      const res = await fetch(`/api/apps/${appId}/domain`);
      const data = await res.json();
      if (res.ok && data.domain !== null) setStatus(data);
    } catch {
      /* transient */
    }
  }, [appId, domain]);

  useEffect(() => {
    if (!domain || gated) return;
    refresh();
    const t = setInterval(refresh, 15000);
    return () => clearInterval(t);
  }, [domain, gated, refresh]);

  async function attach() {
    const d = input.trim().toLowerCase();
    if (!d || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/apps/${appId}/domain`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: d }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't attach that domain.");
        return;
      }
      setDomain(d);
      setStatus(data);
      setInput("");
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(false);
    }
  }

  async function detach() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await fetch(`/api/apps/${appId}/domain`, { method: "DELETE" });
      setDomain(null);
      setStatus(null);
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
      <h2 className="font-semibold text-navy-dark mb-1">Custom domain</h2>

      {gated ? (
        <p className="text-gray-500 text-sm">
          Point your own domain (like <code className="text-navy-dark">app.yourbusiness.com</code>)
          at this app on the{" "}
          <Link href="/billing" className="font-semibold underline">
            Growth
          </Link>{" "}
          plan and up.
        </p>
      ) : !domain ? (
        <>
          <p className="text-gray-500 text-sm mb-4">
            Use your own domain instead of the VisionWorkx URL. You&apos;ll add one or two DNS
            records at your registrar, then it goes live automatically.
          </p>
          <div className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="app.yourbusiness.com"
              className="flex-1 rounded-xl border border-gray-300 px-3 py-2 text-sm text-navy-dark placeholder:text-gray-400 focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
            />
            <button
              onClick={attach}
              disabled={!input.trim() || busy}
              className="bg-navy-dark text-white font-semibold px-4 py-2 rounded-xl hover:bg-navy transition-colors disabled:opacity-40"
            >
              {busy ? "Adding…" : "Add"}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-navy-dark">{domain}</p>
              <p
                className={`text-xs mt-0.5 ${status?.verified ? "text-green-700" : "text-amber-700"}`}
              >
                {status?.verified
                  ? "✓ Verified and live"
                  : "Waiting for DNS — add the records below, then give it a few minutes."}
              </p>
            </div>
            <button
              onClick={detach}
              disabled={busy}
              className="text-sm text-red-500 hover:underline disabled:opacity-40"
            >
              Remove
            </button>
          </div>

          {status && !status.verified && (
            <div className="mt-4 rounded-xl bg-gray-50 border border-gray-100 p-4">
              <p className="text-xs font-medium text-navy-dark">
                Add {status.records.length > 0 ? "these records" : "this record"} at your domain
                registrar:
              </p>
              <RecordTable rows={status.records.length > 0 ? status.records : status.target} />
            </div>
          )}
        </>
      )}

      {error && (
        <div className="mt-3 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}
    </section>
  );
}
