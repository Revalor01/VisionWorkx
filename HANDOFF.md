# HANDOFF — Vision Workx

> Running handoff notes for whoever (or whichever session) picks this up next.
> Newest work at the top.

---

## Closing the Builder Loop — COMPLETE (2026-09-03)

A seven-part push to make a generated app something a real business can run on,
not a demo. All phases shipped as one-PR-per-phase against `main` (PRs #7–#22,
every one merged). No plan items remain.

### What shipped

| Phase | PR | What it does | Key files |
|-------|-----|--------------|-----------|
| 0 | #7 | `generated_code` ⇄ `path→content` map; a revision snapshot on every build | `lib/apps/fileMap.ts`, `lib/apps/revisions.ts`, migration `_052_app_revisions` |
| 1 | #8 | **Request a change** — edit a live app in plain English | `lib/apps/editApp.ts`, `app/apps/[appId]/` edit UI |
| 2 | #9 | **Payments in generated apps** via Stripe Connect Standard — the business owns the account; a platform Checkout bridge means generated apps never hold a Stripe key | `app/api/deploy/route.ts` (`setVercelEnvVars`), migration `_053_app_payments` |
| 3 | #10 | **Insights** — owner-facing analytics off the `vw_metrics_daily` contract view | `lib/apps/insights.ts`, `lib/apps/insightsShared.ts`, migration `_054_app_metrics` |
| 4 | #11 | **Automations** that match the pitch — catalogue per category, driven by the `vw_automation_due` contract view + a cron | `lib/apps/automations.ts`, `app/api/cron/app-automations/route.ts`, migration `_055_automation_channels` |
| 5a/5c | #12 | Data export + self-serve custom domains | `app/api/apps/[appId]/export/route.ts`, migration `_056_app_domain` |
| 5b | #13 | **Reverse trial** — build an app before signing up (`/try`), 72h preview, claim on signup | `app/try/`, `app/api/try/`, `lib/apps/preview.ts`, migration `_057_preview_apps` |
| 6 | #19 | **Two-pass generation** — a cheap plan call (file manifest + schema) then the full implementation with the plan appended | `lib/apps/generatePlan.ts` |
| 6a | #16, #20 | **Validate + repair** before save/deploy: `validateGenerated` (structural) → `repairGenerated` (≤2 Claude rounds); plus a deploy-failure repair keyed on the Vercel build log | `lib/apps/validateGenerated.ts`, `lib/apps/repairGenerated.ts`, `BuildError`/`fetchBuildErrors` in `app/api/deploy/route.ts` |
| 6b | #21 | **Multi-capability apps** — a gym is booking + membership + CRM; `secondary_categories` is additive to the prompt, Automations and Insights | migration `_058_app_secondary_categories`, `*_categories` helpers across `automations.ts`/`insights.ts` |
| 6c | #22 | **Staff logins & team invites** on generated apps — opt-in feature flag, no VW schema change | `TEAM_ACCESS_FEATURE` in `lib/features.ts`; `teamSection` in `app/api/generate/route.ts`; team check in `validateGenerated.ts` |

Fix PRs folded in along the way: #14 (preview abort), #15 (`[FILENAME]` parser
dropped dynamic-route files + token cap), #17 (undici headers timeout; repair/edit
must stream), #18 (`validateRawOutput` false-positive on content mentioning
`[FILENAME:`).

### Migrations

`supabase/migrations/20240101000052…058` — **all applied to the Vision Workx
Supabase project `etiddiiqmcipmqsktjvf`** and verified via the REST API. After any
future migration, verify with an `information_schema.columns` SELECT (a bare
"Success. No rows returned" in the SQL editor does not prove the right project was
hit), and force a PostgREST cache reload with `comment on table public.apps is 'x';`.

### How the pieces fit

- **Generation** (`app/api/generate/route.ts`): `generatePlan(intake)` → stream
  `claude-sonnet-4-6` at 64k tokens (`messages.stream()` + `finalMessage()` is
  required at that size) emitting `[FILENAME: path]…[/FILENAME]` blocks →
  `parseFileMap` → `validateGenerated(raw, map, categories, planFiles, features)`
  → if problems, `repairGenerated(...)` → save `generated_code`, record a revision,
  fire `/api/deploy`.
- **Deploy** (`app/api/deploy/route.ts`): parse blocks → per-app Vercel project +
  per-app Supabase schema `app_<first8ofid>` → inject env (incl. the Stripe
  Checkout bridge vars when a checkout secret is set) → poll
  `/v13/deployments/{id}` for `readyState`. On `ERROR` with a usable build log and
  not already a repair attempt: one `repairGenerated` pass keyed on the log →
  save → fresh `/api/deploy` with `_repairAttempt: true` (one shot only).
- **Contract every generated migration must honour**: the tenant schema defines
  `vw_metrics_daily(day, metric_key, value)` and
  `vw_automation_due(trigger_type, ref_id, recipient_email, recipient_phone, context)`.
  No schema-qualified `public.`/`auth.`/`storage.` DDL, no trigger on `auth.users`,
  no literal hex Tailwind classes — use the `primary`/`background` tokens.
- **Staff logins (6c)**: when `intake.features` includes `TEAM_ACCESS_FEATURE`
  (`👥 Staff logins & invites`), the prompt gains a section requiring a
  `team_members` table, an owner-only `app/team/page.tsx` that mints copyable
  `/join?token=…` links (no email sent), an `app/join/page.tsx` accept flow, and
  server-side access gating on every admin page. `validateGenerated` enforces the
  table + both pages exist; `repairGenerated` and the deploy-failure path carry
  `features` through. Offered in `/onboard` for booking/portal/inventory/membership
  and as a checkbox in `/try`.

### E2E evidence (2026-09-03)

Full `/try` run with staff logins enabled — *Copperline Barber Collective*
(booking + `👥 Staff logins & invites`): generating 18:28 → deploying 18:36 →
deployed 18:42, no repair round, clean build. Verified on the deployed app:
`team_members` table in the migration; `/team` owner-gated (307 when
unauthenticated); `/join` renders with read-only email + friendly invalid/missing
-token states; `/api/team/invite` owner-only, returns an `${origin}/join?token=`
link; `/api/join` runs `signUp()` → upserts the profile → marks the row joined.
The generator integrated the team system with the app's native `profiles.role`
staff model rather than bolting on an orphan table.

Earlier runs (#1→#7 during 6a) took the pipeline from "26/31 files, dynamic routes
404, truncated" to "40–50 files, no truncation, all routes work, clean build".
Two-pass verified on a 50-file portal ($0.014 plan) and a 40-file multi-capability
gym ($0.62 total).

### Known follow-ups

- **Stripe production go-live is on the operator.** Live keys need to be applied
  per the per-app env-var checklist already delivered (chorebit / feelflow /
  mindbit + Vision Workx + Sanctum). New prod env vars only take effect after a
  fresh deploy.
- Cosmetic: generated `JoinForm` redirects to the staff area after an invite is
  accepted regardless of role, so an invited co-owner lands on the staff view.
  Not worth a fix on its own; tighten the `teamSection` prompt if it comes up again.
