# Needs Analyzer Economics & Discount Guard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Needs Analyzer operator a private panel that shows margin, minimum price, and the maximum safe founding-client discount — with a live monthly-cost breakdown by provider — and surface the applied discount on the client proposal.

**Architecture:** A new pure module `lib/needsAnalyzer/economics.ts` consumes the `Plan` already returned by `computePlan` plus the catalog settings and returns an `Economics` object. `computePlan`/`rules.ts` are NOT modified, so `rules.test.ts` and the offline app on Machine B are untouched. The operator UI extends the existing operator-only `InternalView`. The monthly discount reaches the client proposal through a presentation-layer prop, not the rules engine.

**Tech Stack:** Next.js 14 (App Router), TypeScript, React, vitest. Existing NA UI primitives in `app/admin/needs-analyzer/ui.tsx`.

**Spec:** `docs/superpowers/specs/2026-11-02-needs-analyzer-economics-design.md`

## Global Constraints

- Do NOT modify `lib/needsAnalyzer/rules.ts` `computePlan` output shape or `lib/needsAnalyzer/rules.test.ts`. Economics is additive only (offline-app parity on Machine B).
- VisionWorkx rules: branch `vw/needs-analyzer-economics`, small commits, PR preview only, never push `main`, no prod deploy, no Supabase schema change (this feature needs none).
- All new `Catalog["settings"]` fields are OPTIONAL with defaults, so existing saved `vw_na_settings` rows keep loading.
- Economics, margin, cost, and internal rate are OPERATOR-ONLY — never rendered in client mode or on the public `/proposal/[token]` route, except the applied founding-client discount line.
- Default economic assumptions (confirmed by Steve 2026-11-02): targetMarginPct 50, platformCostMonthly 45, activeClientApps 1, aiCostMonthly 8, supportHoursMonthly 1, internalRate 60 (existing), stripePct 2.9, stripeFixed 0.30.
- Currency is rendered with the existing `moneyFmt(catalog)` helper (`m()`).

## Review Focus

- `activeClientApps` of 0, blank, or missing → economics must clamp the divisor to 1, not divide by zero (Task 2).
- `monthly` list of 0 (no recurring items selected) → monthly `marginPct` must be 0, not NaN/Infinity (Task 2).
- Saved settings missing the new fields → `computeEconomics` must fall back to the defaults constant and not crash (Task 2).
- A discount past break-even → status `loss`, negative margin shown in red, never hidden or clamped silently (Task 2 pins the value; Task 3 shows red).
- Client mode / public proposal → the economics panel and all margin/cost must not render; only the founding-client discount line shows (Task 3 gate; Task 4 proposal line).

---

### Task 1: Economics settings (types, defaults, catalog editor)

**Files:**
- Modify: `lib/needsAnalyzer/types.ts` — extend `Catalog["settings"]` and `Overrides`
- Modify: `lib/needsAnalyzer/catalog.default.json` — seed the new settings
- Modify: `app/admin/needs-analyzer/CatalogEditor.tsx` — add an "Economics" settings group

**Interfaces:**
- Produces: new optional `Catalog["settings"]` fields `targetMarginPct`, `platformCostMonthly`, `activeClientApps`, `aiCostMonthly`, `supportHoursMonthly`, `stripePct`, `stripeFixed` (all `number`); new optional `Overrides.monthlyDiscountPct?: number`.

- [ ] **Step 1: Add the optional fields** to the `settings` object type in `lib/needsAnalyzer/types.ts` (after `discountPct`), each `?: number`, plus `monthlyDiscountPct?: number` on the `Overrides` interface (near `discountPct?`).

- [ ] **Step 2: Seed defaults** in `lib/needsAnalyzer/catalog.default.json` `settings`: `targetMarginPct: 50, platformCostMonthly: 45, activeClientApps: 1, aiCostMonthly: 8, supportHoursMonthly: 1, stripePct: 2.9, stripeFixed: 0.3`.

- [ ] **Step 3: Add the inputs** to `CatalogEditor.tsx`. Extend the `SETTINGS` tuple list with the seven fields (all `"number"`), labels: "Target margin (%)", "Shared platform cost ($/mo)", "Active client apps (share across)", "AI cost per app ($/mo)", "Support hours per app (/mo)", "Stripe fee (%)", "Stripe fixed fee ($)". They save through the existing debounced-save path unchanged.

- [ ] **Step 4: Typecheck** — Run: `npx tsc --noEmit` · Expected: no new errors.

- [ ] **Step 5: Commit**
```bash
git add lib/needsAnalyzer/types.ts lib/needsAnalyzer/catalog.default.json app/admin/needs-analyzer/CatalogEditor.tsx
git commit -m "feat(needs-analyzer): add economics cost settings"
```

---

### Task 2: `economics.ts` pure module + tests

**Files:**
- Create: `lib/needsAnalyzer/economics.ts`
- Test: `lib/needsAnalyzer/economics.test.ts`

**Interfaces:**
- Consumes: `Plan` from `./rules` (uses `plan.setupGross`, `plan.internalCost`, `plan.monthly`), `Catalog["settings"]` from `./types`.
- Produces:
  - `ECON_DEFAULTS` — constant with the Global Constraints default values.
  - `interface EconSide { list; cost; price; margin; marginPct; minPrice; safeDiscountPct; breakEvenDiscountPct }` (all `number`).
  - `interface Economics { monthly: { platformShare; stripe; ai; hostingSubtotal; labor; allInCost; lines: {key;label;amount}[] }; setup: EconSide; monthlySide: EconSide; discountPct; combinedSafeDiscountPct; combinedBreakEvenDiscountPct; bindingSide: "setup"|"monthly"; status: "target"|"thin"|"loss" }`.
  - `function computeEconomics(plan: Plan, settings: Catalog["settings"], opts?: { discountPct?: number }): Economics`.

Calculation rules (pin in tests):
- `n = max(1, settings.activeClientApps ?? ECON_DEFAULTS.activeClientApps)`; `platformShare = platformCostMonthly / n`.
- `d = opts?.discountPct ?? 0` applied to BOTH sides from LIST figures (`plan.setupGross`, `plan.monthly`) — ignore `plan.setupNet`/`plan.discountPct` here.
- `stripeOn(p) = p > 0 ? p*stripePct/100 + stripeFixed : 0`.
- Breakdown `monthly.stripe` uses `stripeOn(plan.monthly)` (list); `hostingSubtotal = platformShare + ai + stripe(list)`; `labor = supportHoursMonthly*internalRate`; `allInCost = hostingSubtotal + labor`.
- `setup`: `cost = plan.internalCost`; `price = setupGross*(1-d/100)`; `minPrice = cost/(1-target)`; `safe = round((1-minPrice/list)*100)`; `be = round((1-cost/list)*100)`.
- `monthlySide`: `fixed = platformShare+ai+labor`; `price = monthly*(1-d/100)`; `cost = fixed + stripeOn(price)`; `minPrice = (fixed+stripeFixed)/(1 - stripePct/100 - target)`; `safe = round((1-minPrice/list)*100)`; `be = round((1 - ((fixed+stripeFixed)/(1-stripePct/100))/list)*100)`.
- `marginPct = list>0 && price>0 ? round(margin/price*100) : 0`.
- `combinedSafe = min(setup.safe, monthlySide.safe)`; `combinedBE = min(setup.be, monthlySide.be)`; `bindingSide = setup.safe<=monthlySide.safe ? "setup" : "monthly"`.
- `status = d>combinedBE ? "loss" : d>combinedSafe ? "thin" : "target"`.

- [ ] **Step 1: Write the failing test** `lib/needsAnalyzer/economics.test.ts`. Build a stub `Plan` with `setupGross: 5250, internalCost: 2100, monthly: 248` (other fields as needed to satisfy the type) and settings `{ internalRate:60, platformCostMonthly:45, activeClientApps:5, aiCostMonthly:8, supportHoursMonthly:1, targetMarginPct:50, stripePct:2.9, stripeFixed:0.3 }`.
```ts
import { describe, it, expect } from "vitest";
import { computeEconomics } from "./economics";
// e = computeEconomics(plan, settings, { discountPct: 15 })
it("breaks monthly cost into providers", () => {
  expect(e.monthly.platformShare).toBeCloseTo(9, 2);
  expect(e.monthly.stripe).toBeCloseTo(7.49, 2);
  expect(e.monthly.hostingSubtotal).toBeCloseTo(24.49, 2);
  expect(e.monthly.allInCost).toBeCloseTo(84.49, 2);
});
it("computes setup margin and floor", () => {
  expect(e.setup.marginPct).toBe(53);
  expect(e.setup.safeDiscountPct).toBe(20);
  expect(e.setup.breakEvenDiscountPct).toBe(60);
});
it("names the binding side and status", () => {
  expect(e.combinedSafeDiscountPct).toBe(20);
  expect(e.bindingSide).toBe("setup");
  expect(e.status).toBe("thin"); // 15% < 20%? -> "target"; assert the real value after Step 3
});
it("clamps activeClientApps to 1 when 0/blank", () => {
  const z = computeEconomics(plan, { ...settings, activeClientApps: 0 }, { discountPct: 0 });
  expect(z.monthly.platformShare).toBeCloseTo(45, 2);
});
it("handles zero monthly and missing fields without NaN", () => {
  const zero = computeEconomics({ ...plan, monthly: 0 }, {}, { discountPct: 0 });
  expect(Number.isFinite(zero.monthlySide.marginPct)).toBe(true);
});
it("reports loss past break-even", () => {
  const loss = computeEconomics(plan, settings, { discountPct: 65 });
  expect(loss.status).toBe("loss");
  expect(loss.setup.margin).toBeLessThan(0);
});
```
(Correct the one inline-noted assertion to the implemented value in Step 3; `d=15 < safe=20` ⇒ `"target"`.)

- [ ] **Step 2: Run test to verify it fails** — Run: `npx vitest run lib/needsAnalyzer/economics.test.ts` · Expected: FAIL ("computeEconomics is not a function").

- [ ] **Step 3: Implement** `ECON_DEFAULTS`, the types, and `computeEconomics(...)` in `lib/needsAnalyzer/economics.ts` per the calculation rules above, reading each setting as `settings.X ?? ECON_DEFAULTS.X`.

- [ ] **Step 4: Run tests to verify they pass** — Run: `npx vitest run lib/needsAnalyzer/economics.test.ts` · Expected: PASS. Then `npx vitest run lib/needsAnalyzer/rules.test.ts` · Expected: still PASS (unchanged).

- [ ] **Step 5: Commit**
```bash
git add lib/needsAnalyzer/economics.ts lib/needsAnalyzer/economics.test.ts
git commit -m "feat(needs-analyzer): economics engine (margin, min price, discount guard)"
```

---

### Task 3: Operator economics panel on the Internal tab

**Files:**
- Create: `app/admin/needs-analyzer/EconomicsPanel.tsx`
- Modify: `app/admin/needs-analyzer/Workspace.tsx` — render `<EconomicsPanel>` inside `InternalView` (after the Stat row ~line 745) and wire "Apply to proposal"

**Interfaces:**
- Consumes: `computeEconomics` + `Economics` (Task 2); `Plan`, `Catalog` types; `moneyFmt`, `Stat`, `CARD`, `NUM`, `useToast` from `./ui`.
- Produces: `function EconomicsPanel({ plan, catalog, onApply }: { plan: Plan; catalog: Catalog; onApply: (discountPct: number) => void }): JSX.Element`.

- [ ] **Step 1: Build `EconomicsPanel.tsx`.** Client component. Local `useState` for `discount` (0–70, default 15) and `clients` (default `catalog.settings.activeClientApps ?? 1`). On each render call `computeEconomics(plan, { ...catalog.settings, activeClientApps: clients }, { discountPct: discount })`. Render: (a) the provider cost breakdown (platform share, Stripe, AI, hosting subtotal, support labor, all-in) using `m()`; (b) setup & monthly margin $/% via `Stat`, red when negative, each with its minimum price (`setup.minPrice` / `monthlySide.minPrice`) shown as the `Stat` sub-label ("floor {m(minPrice)}"); (c) a range input bound to `discount` with a traffic-light bar colored from `combinedSafeDiscountPct`/`combinedBreakEvenDiscountPct`, the `status` word, and a line naming `bindingSide`, max-safe and break-even; (d) a founding-client preview (list struck through → discounted setup and monthly, year-one savings); (e) an "Apply to proposal" button calling `onApply(discount)`. Wrap the section in the house gold-brown outline (`border` with `#B8860B`).

- [ ] **Step 2: Render it from `InternalView`.** In `Workspace.tsx`, after the existing Stat grid in `InternalView`, add `<EconomicsPanel plan={P} catalog={catalog} onApply={(d) => { /* patch overrides */ }} />`. Wire `onApply` to the assessment's existing local-patch/save path (the same `patchLocal`/overrides save used elsewhere) setting `overrides.discountPct = d` and `overrides.monthlyDiscountPct = d`; show a toast via `useToast`. `InternalView` already renders only on the operator Internal tab (hidden in client mode), so no extra gate is needed — confirm `view` cannot be `"internal"` when `clientMode` is on (it is remapped to `"plan"` at Workspace line ~137).

- [ ] **Step 3: Typecheck + manual verify** — Run: `npx tsc --noEmit` (no new errors). Manual: open an assessment → Internal tab → breakdown shows; drag discount through green→amber→red; toggle Client mode and confirm the panel disappears.

- [ ] **Step 4: Commit**
```bash
git add app/admin/needs-analyzer/EconomicsPanel.tsx app/admin/needs-analyzer/Workspace.tsx
git commit -m "feat(needs-analyzer): operator economics & discount panel on Internal tab"
```

---

### Task 4: Founding-client discount on the client proposal

**Files:**
- Modify: `app/admin/needs-analyzer/Proposal.tsx` — accept `monthlyDiscountPct` and render a monthly discount line + discounted monthly total
- Modify: `app/admin/needs-analyzer/Workspace.tsx:707` and `app/proposal/[token]/page.tsx:48` — pass `monthlyDiscountPct` from overrides

**Interfaces:**
- Consumes: `Overrides.monthlyDiscountPct` (Task 1).
- Produces: `Proposal` gains prop `monthlyDiscountPct?: number`.

- [ ] **Step 1: Extend `Proposal`.** Add `monthlyDiscountPct?: number` to its props type and destructure it. Compute `monthlyDiscount = Math.round(P.monthly * (monthlyDiscountPct ?? 0) / 100)` and `monthlyNet = P.monthly - monthlyDiscount`. Where the totals render (lines ~165–175): keep the existing setup "Founding-client discount ({P.discountPct}%)" line; add a sibling monthly line `Founding-client discount ({monthlyDiscountPct}%) −{m(monthlyDiscount)}/mo` shown only when `monthlyDiscount > 0`; change the final monthly total (line ~175) to render `{m(monthlyNet)}/mo`.

- [ ] **Step 2: Thread the prop** at both call sites: `Workspace.tsx:707` add `monthlyDiscountPct={a.overrides?.monthlyDiscountPct}`; `app/proposal/[token]/page.tsx:48` add `monthlyDiscountPct={assessment.overrides?.monthlyDiscountPct}`.

- [ ] **Step 3: Typecheck + manual verify** — Run: `npx tsc --noEmit`. Manual: apply a discount from the Internal panel (Task 3), open the Proposal tab and the public `/proposal/[token]` page, confirm both setup and monthly show the founding-client discount and the discounted monthly total, and that no margin/cost leaks to the client view.

- [ ] **Step 4: Commit**
```bash
git add app/admin/needs-analyzer/Proposal.tsx app/admin/needs-analyzer/Workspace.tsx app/proposal/[token]/page.tsx
git commit -m "feat(needs-analyzer): show founding-client discount on setup and monthly in proposal"
```

---

## Notes for the PR
- Add/adjust a `qa()` test for the operator economics surface per the repo QA rule (`qa/products/...`), stable id `needs-analyzer/internal/economics`.
- Before opening the PR: run `release-checker` and `security-reviewer` (no migration, so `migration-reviewer` not required); `docs-keeper` at the end.
