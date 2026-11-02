# Needs Analyzer — Proposal Economics & Discount Guard (design)

**Date:** 2026-11-02
**Repo:** VisionWorkx (Machine A). Feature lives under the Needs Analyzer.
**Status:** Design for approval. No code until Steve replies "approved".

## Intent (the why)

Steve is quoting his first custom-app client and needs to walk into the call knowing
three things at once:

1. **His margin** on any given price — both the one-time build (setup) and the recurring
   monthly.
2. **The minimum price** he can quote and still hit his target margin.
3. **How big a discount** he can offer — so the client feels they're getting a
   founding-client deal — *without* quietly pricing himself into a loss.

Today the Needs Analyzer computes setup `internalCost` and a one-time `margin`, but there
is no monthly cost model, no target-margin floor, no minimum price, and no discount guard.
This feature adds all of that as an **operator-only** panel.

## Who it serves

The operator (Steve) only. It is never shown to the client — it lives on the existing
operator-only **Internal** tab in `Workspace.tsx`, which client mode already hides along
with scores and margin.

## Goals

- Show, on the Internal tab, a live **monthly cost breakdown** itemized by provider:
  Supabase + Vercel (shared platform share), Stripe, Claude API, and support labor —
  with hosting cost (cash) separated from labor.
- Show **setup margin** and **monthly margin** in $ and %.
- Show the **minimum setup price** and **minimum monthly price** for the target margin.
- A **single combined discount** control (one lever for the whole deal) with a traffic-light
  readout: green = still at/above target margin, amber = profitable but below target, red =
  past break-even. It reports the max safe discount and the break-even discount, and names
  which side (setup or monthly) is the binding constraint.
- A **client-facing preview**: list price struck through → discounted price, framed as a
  "Founding-client offer: N% off", plus year-one savings.
- The combined discount, when applied, flows to the client proposal as a presented discount
  on both setup and monthly.

## Non-goals (v1)

- **Per-module** cost modelling. v1 uses global cost settings (one platform figure, one AI
  estimate, one support-hours figure). Per-module support/infra can come later.
- Changing the scoring or the `computePlan` output shape (see Constraints — this is load-bearing).
- Multi-currency margin (uses the existing `currency` symbol only).
- Tracking actual vs. estimated cost over time (no new usage wiring).

## Anti-goals (would make this a failure even if it "works")

- Any path that shows margin, cost, or internal rate to the client.
- A discount control that lets the operator quote below break-even without a clear red warning.
- A change to `lib/needsAnalyzer/rules.ts` `computePlan` output that drifts from the offline
  app on Machine B and breaks `rules.test.ts`.

## Constraints (hard)

- **Offline-app parity.** `lib/needsAnalyzer/questions.ts` and `rules.ts` must stay identical
  in behaviour to the offline Needs Analyzer (Machine B owns it; we don't edit that repo).
  `rules.test.ts` pins `computePlan`'s output. Therefore the economics logic is added as a
  **separate, additive pure function** — `lib/needsAnalyzer/economics.ts` — that *consumes*
  a `Plan` and the catalog settings and returns a new `Economics` object. `computePlan` and
  its return shape are **not** modified, so the pinned tests stay green and no Machine B change
  is required for v1.
- **Operator-only.** All new UI sits behind the existing `useClientMode()` gate, on the
  Internal tab. Nothing new renders in client mode or on the public `/proposal/<token>`
  except the already-approved founding-client discount presentation (see Open decision 1).
- VisionWorkx working rules: branch `vw/…`, PR preview only, no push to main, no prod deploy.
  Any new settings are additive and optional (back-compatible with saved `vw_na_settings`).
- House UI standard: Revalor screen spacing (`.admin-page` max-width 1760px, px-4 sm:px-6
  lg:px-10 py-8) and gold-brown (#B8860B) section outlines, within the existing NA shell.

## Decisions already made (with Steve)

- Clients **share one Supabase project** → platform cost is a shared figure divided across the
  active client apps, not $25 per client.
- **One combined discount**, not separate setup/monthly levers.
- **Target margin = 50%.**
- Default cost assumptions (editable in Catalog & pricing): shared platform **$45/mo**
  (Supabase $25 + Vercel $20), Claude API **$8/mo**, support **1 hr/mo**, internal rate **$60/hr**
  (existing `internalRate`). Stripe modelled at **2.9% + $0.30** per monthly charge.

## The parts left to the builder, and how they fit

### 1. New settings (additive) on `Catalog["settings"]` in `lib/needsAnalyzer/types.ts`
All optional with sensible fallbacks so old saved settings still load:
- `targetMarginPct?: number` (default 50)
- `platformCostMonthly?: number` (default 45) — shared Supabase + Vercel
- `activeClientApps?: number` (default 1) — divisor for the platform share
- `aiCostMonthly?: number` (default 0) — Claude estimate per app
- `supportHoursMonthly?: number` (default 1)
- `stripePct?: number` (default 2.9), `stripeFixed?: number` (default 0.30)

Surface these in `CatalogEditor.tsx`'s `SETTINGS` list (new "Economics" group), same debounced-save
path as existing settings. Reset-to-defaults covers them via the default catalog.

### 2. `lib/needsAnalyzer/economics.ts` (new, pure, unit-tested)
`computeEconomics(plan: Plan, settings: Catalog["settings"], opts?: { discountPct?: number }): Economics`

Derives, from the `Plan` already returned by `computePlan`:
- `platformShare = platformCostMonthly / max(1, activeClientApps)`
- `monthlyHostingCost = platformShare + aiCostMonthly + stripeOn(discountedMonthly)`
- `monthlyLabor = supportHoursMonthly * internalRate`
- `monthlyCost = monthlyHostingCost + monthlyLabor`
- setup side reuses `plan.internalCost` (already `effortHours * internalRate`)
- margins ($/%), min prices for target margin, break-even and max-safe discount per side,
  and the combined binding constraint (min of the two).
- `stripeOn(p) = p>0 ? p*stripePct/100 + stripeFixed : 0`

New `Economics` type lives in `economics.ts` (not in the pinned `rules.ts`).
New `economics.test.ts` pins these calculations (does not touch `rules.test.ts`).

### 3. Operator UI — extend `InternalView` in `app/admin/needs-analyzer/Workspace.tsx`
Add an "Economics" section below the existing Effort / Internal cost stats:
- the itemized monthly cost breakdown (hosting subtotal separated from labor),
- setup & monthly margin ($/%),
- a single combined-discount slider with the green/amber/red bar, max-safe and break-even
  readout, and the binding-side note,
- the client-facing founding-client preview (struck-through list → discounted, year-one savings).
Reuse existing `ui.tsx` primitives (`Stat`, `Card`, `m()` currency formatter). All inside the
`!clientMode` guard (InternalView already is).

### 4. Applying the discount to the client proposal
The slider is a live what-if. An **"Apply to proposal"** action writes the chosen discount to the
assessment overrides. Setup uses the **existing** `ov.discountPct` (already honoured by
`computePlan` → `setupNet`). The monthly discount is applied in the **presentation layer**
(`Proposal.tsx` / the economics layer), *not* in `computePlan`, to preserve offline parity —
a new `ov.monthlyDiscountPct` override read only by the online proposal view. See Open decision 1.

## How to test
- `economics.test.ts`: cost breakdown, margins, min prices, break-even and max-safe discount,
  shared-platform divisor, Stripe scaling with discounted price.
- Manual: open an assessment → Internal tab → confirm breakdown, drag discount through green→amber→red,
  confirm nothing appears in client mode or on `/proposal/<token>` except the applied founding-client
  discount. Add a `qa()` test per the repo's QA rule for the new operator surface.
- `npm test` (or the needs-analyzer test subset) stays green, `rules.test.ts` unchanged.

## How to roll back
Pure additive change: revert the branch. New settings are optional, so saved `vw_na_settings`
rows are unaffected. No migration. No change to `computePlan`, so no Machine B impact.

## Decisions resolved (Steve, 2026-11-02)
1. **The combined discount DOES show on the client proposal** — list price struck through →
   founding-client price, on both setup and monthly, labelled "Founding-client offer: N% off".
   Implemented with a `monthlyDiscountPct` override read only by the online proposal/presentation
   layer (no change to the shared rules engine).
2. **Stripe fees DO count** against monthly margin (2.9% + $0.30 on the collected charge).

## Calls I made (as the builder, flag if wrong)
- Economics is a **separate pure module**, not a change to `computePlan`, specifically to keep
  Machine B's offline app and `rules.test.ts` untouched. This is the single most important call.
- v1 cost model is **global**, not per-module.
- Monthly discount is applied in the **presentation layer**, not the shared rules engine.
- Defaults seeded from the numbers Steve confirmed; `activeClientApps` defaults to 1 (so a fresh
  install never *under*-counts cost) and Steve sets the real count in Catalog & pricing.
