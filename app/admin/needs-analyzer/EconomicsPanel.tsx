"use client";

import { useState } from "react";
import { computeEconomics } from "@/lib/needsAnalyzer/economics";
import type { Plan } from "@/lib/needsAnalyzer/rules";
import type { Catalog } from "@/lib/needsAnalyzer/types";
import { BTN_PRIMARY, CARD, moneyFmt, NUM, Stat } from "./ui";

const GOLD = "#B8860B";

// Operator-only. Shows the cost breakdown, margin, minimum price and the maximum safe
// founding-client discount, and applies the chosen discount to the proposal. Rendered
// only on the Internal tab (hidden in client mode by Workspace).
export default function EconomicsPanel({
  plan,
  catalog,
  onApply,
}: {
  plan: Plan;
  catalog: Catalog;
  onApply: (discountPct: number) => void;
}) {
  const m = moneyFmt(catalog);
  const [discount, setDiscount] = useState(catalog.settings.discountPct || 15);
  const [clients, setClients] = useState(catalog.settings.activeClientApps ?? 1);

  const e = computeEconomics(plan, { ...catalog.settings, activeClientApps: clients }, { discountPct: discount });
  const safe = Math.max(e.combinedSafeDiscountPct, 0);
  const be = e.combinedBreakEvenDiscountPct;
  const EM = "#047857", WARN = "#c77700", BAD = "#b91c1c";
  const statusColor = e.status === "loss" ? BAD : e.status === "thin" ? WARN : EM;
  const statusWord = e.status === "loss" ? "losing money" : e.status === "thin" ? "thin margin" : "within target";
  const barBg = `linear-gradient(to right, ${EM} 0 ${safe}%, ${WARN} ${safe}% ${be}%, ${BAD} ${be}% 100%)`;

  const money = (n: number) => m(Math.round(n));
  const marginClass = (ok: boolean) => (ok ? "!text-emerald-700" : "!text-red-700");

  const setupDisc = e.setup.list - e.setup.price;
  const monthlyDisc = e.monthlySide.list - e.monthlySide.price;
  const yearOneSaved = setupDisc + monthlyDisc * 12;

  return (
    <div className="mt-6 rounded-xl border-2 bg-white p-5" style={{ borderColor: GOLD }}>
      <div className="mb-1 flex items-center justify-between">
        <h3 className="font-semibold text-zinc-900">Economics — margin, minimum price &amp; discount</h3>
        <span className="text-xs text-zinc-500">Operator only · never shown to the client</span>
      </div>

      {/* cost breakdown */}
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-zinc-600">
        Active client apps sharing the platform:
        <input
          className={NUM}
          type="number"
          min={1}
          max={50}
          value={clients}
          onChange={(ev) => setClients(Math.max(1, Number(ev.target.value) || 1))}
        />
        <span className="text-zinc-400">(Supabase + Vercel split across them)</span>
      </div>
      <table className="mb-5 w-full text-sm">
        <tbody>
          <tr className="border-b border-zinc-100"><td className="py-1.5">Shared platform share</td><td className="py-1.5 text-right">{money(e.monthly.platformShare)}/mo</td></tr>
          <tr className="border-b border-zinc-100"><td className="py-1.5">Stripe (on the monthly charge)</td><td className="py-1.5 text-right">{m(e.monthly.stripe)}/mo</td></tr>
          <tr className="border-b border-zinc-100"><td className="py-1.5">Claude API (estimate)</td><td className="py-1.5 text-right">{money(e.monthly.ai)}/mo</td></tr>
          <tr className="border-b border-zinc-200 font-semibold"><td className="py-1.5">Hosting subtotal (cash)</td><td className="py-1.5 text-right">{m(e.monthly.hostingSubtotal)}/mo</td></tr>
          <tr className="border-b border-zinc-100"><td className="py-1.5">Support time (your labor)</td><td className="py-1.5 text-right">{money(e.monthly.labor)}/mo</td></tr>
          <tr className="font-bold text-zinc-900"><td className="py-1.5">All-in monthly cost</td><td className="py-1.5 text-right">{m(e.monthly.allInCost)}/mo</td></tr>
        </tbody>
      </table>

      {/* margins */}
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Setup margin" value={`${e.setup.marginPct}%`} sub={`${money(e.setup.margin)} · floor ${money(e.setup.minPrice)}`} valueClass={marginClass(e.setup.margin >= 0)} />
        <Stat label="Monthly margin" value={`${e.monthlySide.marginPct}%`} sub={`${money(e.monthlySide.margin)}/mo · floor ${money(e.monthlySide.minPrice)}`} valueClass={marginClass(e.monthlySide.margin >= 0)} />
        <Stat label="Setup price" value={money(e.setup.price)} sub={`list ${money(e.setup.list)}`} />
        <Stat label="Monthly price" value={`${money(e.monthlySide.price)}/mo`} sub={`list ${money(e.monthlySide.list)}`} />
      </div>

      {/* combined discount */}
      <div className={CARD}>
        <div className="flex items-center justify-between">
          <span className="text-sm">Founding-client discount <b className="text-lg">{discount}%</b></span>
          <span className="text-sm font-semibold" style={{ color: statusColor }}>{statusWord}</span>
        </div>
        <input type="range" min={0} max={70} value={discount} onChange={(ev) => setDiscount(Number(ev.target.value))} className="mt-3 w-full" style={{ accentColor: "#2E6DA4" }} />
        <div className="mt-2 h-2.5 rounded" style={{ background: barBg }} />
        <div className="mt-1 flex justify-between text-xs text-zinc-500">
          <span>0%</span>
          <span>safe → {safe}%</span>
          <span>break-even {be}%</span>
        </div>
        <p className="mt-3 text-sm text-zinc-700">
          {e.status === "loss"
            ? `⛔ Past break-even — this deal loses money. Pull back under ${be}%.`
            : e.status === "thin"
              ? `⚠️ Under your target margin (the ${e.bindingSide} side binds first). Still profitable up to ${be}%, below target past ${safe}%.`
              : `✅ Healthy. You can discount up to ${safe}% and keep your target margin on both setup and monthly (break-even at ${be}%). The ${e.bindingSide} side is your tightest limit.`}
        </p>
      </div>

      {/* client preview + apply */}
      <p className="mt-4 text-sm text-zinc-700">
        <b>What the client sees:</b> Setup <s className="text-zinc-400">{money(e.setup.list)}</s> <b>{money(e.setup.price)}</b> · Monthly{" "}
        <s className="text-zinc-400">{money(e.monthlySide.list)}</s> <b>{money(e.monthlySide.price)}/mo</b> — a “Founding-client offer: {discount}% off”.
        They save about <b>{money(yearOneSaved)}</b> in year one.
      </p>
      <button type="button" className={`${BTN_PRIMARY} mt-3`} onClick={() => onApply(discount)}>
        Apply {discount}% to proposal
      </button>
    </div>
  );
}
