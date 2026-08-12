"use client";

import { useEffect, useState } from "react";
import type { MediaSpendSummary } from "@/lib/social/gatewaySpend";

function formatUsd(amount: number): string {
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

// Shared by RecapTab (video) and ContentTab (images) — both generate media
// through the same Vercel AI Gateway account, so `focus` just changes which
// number is emphasized; the underlying spend report always covers both.
export default function MediaSpendCard({ focus }: { focus: "video" | "image" }) {
  const [spend, setSpend] = useState<MediaSpendSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/social/spend?days=30");
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setSpend(body);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const primaryCost = spend ? (focus === "video" ? spend.videoCost : spend.imageCost) : 0;
  const primaryRequests = spend ? (focus === "video" ? spend.videoRequests : spend.imageRequests) : 0;
  const secondaryLabel = focus === "video" ? "Photos (Flux)" : "Videos (Kling)";
  const secondaryCost = spend ? (focus === "video" ? spend.imageCost : spend.videoCost) : 0;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4">
      <div className="flex justify-between items-start">
        <div>
          <p className="text-xs font-medium text-slate-500">
            {focus === "video" ? "Video generation spend" : "Photo generation spend"} — last 30 days
          </p>
          {loading ? (
            <p className="text-2xl font-semibold text-[#1A3A5C] mt-1">…</p>
          ) : error ? (
            <p className="text-sm text-red-600 mt-1">{error}</p>
          ) : (
            <p className="text-2xl font-semibold text-[#1A3A5C] mt-1">
              {formatUsd(primaryCost)}
              <span className="text-xs font-normal text-slate-400 ml-2">{primaryRequests} generation{primaryRequests === 1 ? "" : "s"}</span>
            </p>
          )}
        </div>
        <button onClick={load} disabled={loading} className="text-xs font-medium text-sky-600 hover:underline disabled:opacity-50">
          Refresh
        </button>
      </div>
      {!loading && !error && spend && (
        <p className="text-xs text-slate-400 mt-2">
          {secondaryLabel}: {formatUsd(secondaryCost)} · Combined total: {formatUsd(spend.totalCost)} · Actuals from Vercel AI Gateway,{" "}
          {spend.rangeStart} to {spend.rangeEnd}
        </p>
      )}
    </div>
  );
}
