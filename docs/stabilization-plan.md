# VisionWorkx Stabilization Plan

_Started 2026-09-10. Owner: solo. Status: **build freeze in effect** — no new client builds until Tier 0 + Tier 1 land._

---

## Why this exists

In one working session the generate → deploy pipeline hit six distinct failure
modes, and two of them damaged infrastructure **outside** the app being built:

| # | Failure | Root cause | Blast radius | Status |
|---|---------|-----------|--------------|--------|
| 1 | Generated app loops `/login` ↔ home | unpinned `next` drifts to 15/16 → `cookies()` becomes async → every server auth check breaks | one app | mitigated 3 ways (deploy clamp, `validateGenerated`, canary probe) |
| 2 | `build_error` on `.map()` returning `null` in a cart | LLM emits subtly wrong TS; repair loop only gets ~2 slow remote tries | one app | deterministic null-filter fixer added (`d6c668f`) |
| 3 | **Entire REST API 503 (`PGRST002`)** | one shared PostgREST `db_schema`; a stale tenant entry takes down every app + the platform | **all tenants + platform** | hardened: `tenantSchema.ts` throws instead of swallowing, `/api/cron/db-health` self-heals every 10 min (`0717199`, `091d60e`) |
| 4 | Live app returns `400 Invalid schema` | regenerate unexposed the schema that still held the customer's real data | one app + its data | fixed by hand |
| 5 | `automation_events_app_id_fkey` FK violation on every write | tenant triggers were baked with a hard-coded `app_id` that regenerate then deleted | one app | fixed by hand |
| 6 | App silently rebuilt as the wrong category (storefront → booking) | edit / regenerate path falls through to `DEFAULT_FORM.category = "booking"` | one app + wasted build | **open** |
| 7 | Row left with `generated_code = NULL`, `status` stranded | a mid-pipeline throw leaves the `apps` row half-written | one app, unrecoverable without hand surgery | **open** |

Failures 4–7 are the same underlying defect: **mutation paths (onboard-edit,
regenerate, deploy) are not transactional, and regeneration is destructive.**
That is what makes the product unsellable — not that builds sometimes fail, but
that a failure can corrupt a *different* tenant or destroy data.

---

## Scope decision (2026-09-10)

Two independent workstreams:

- **A — Stabilize the pipeline (this document).** Every *new* build either
  works or fails without touching anything else. All effort goes here.
- **B — Legacy remediation (parked, see bottom).** Existing apps
  (Linked Legacy + 4 healthy legacy booking apps) get fixed on their own track
  once A is solid. Not in scope now.

---

## Baseline audit — snapshot 2026-09-10

Script: `scratchpad/baseline-audit.mjs` (read-only). Re-run any time.

### apps rows (6)

| id | name | category | status | code | schema | Vercel project | verdict |
|----|------|----------|--------|------|--------|----------------|---------|
| `741aa936` | Sunny Day Spa Booking App | booking | deployed | 105 KB | `app_741aa936` (3 tbl) | exists | **legacy, healthy** |
| `e5fcbdd6` | Peak Performance Gym | booking | deployed | 104 KB | `app_e5fcbdd6` (5 tbl) | exists | **legacy, healthy** |
| `c0640777` | Green Blade Lawn Care Booking App | booking | deployed | 105 KB | `app_c0640777` (6 tbl) | exists | **legacy, healthy** |
| `a8f2042a` | Automation Test Studio Booking App | booking | deployed | 65 KB | `app_a8f2042a` (4 tbl) | exists | **legacy, test app** |
| `3f6587bd` | Linked Legacy Permanent Jewelry LLC | booking | deployed | **NULL** | `app_3f6587bd` (partial, 0 bookings) | exists | **broken — legacy track**; real data stranded in `app_ef6ca6a6` |
| `a726f49a` | Canary Law Customer Portal | portal | deployed | 137 KB | **none** | **none** | **zombie row — delete** (canary tracking row, no schema, no project, deploy_url 404s) |

### tenant schemas (17) — 12 orphaned (no apps row)

| schema | tables | rows | origin | verdict |
|--------|--------|------|--------|---------|
| `app_ef6ca6a6` | 7 | **7 appts, 6 contacts, 5 invoices, 4 services** | Linked Legacy's real data | **PRESERVE — legacy track** |
| `app_d286e89f` | 13 | empty (all 0) | abandoned Linked Legacy regen | drop |
| `app_08d38616` | 5 | — | canary: candles online-store | drop |
| `app_dea458d3` | 5 | — | canary: candles online-store | drop |
| `app_d2ea49ad` | 5 | — | canary: law portal | drop |
| `app_4220e1d9` | 6 | — | canary: law portal | drop |
| `app_d388255e` | 6 | — | canary: plumbing invoicing | drop |
| `app_35694168` | 7 | — | canary: plumbing invoicing | drop |
| `app_23e6a567` | 5 | — | canary: salon booking | drop |
| `app_f2ccaf2e` | 5 | — | canary: salon booking | drop |
| `app_b68d6436` | 3 | — | canary: coffee booking | drop |
| `app_6b6b8552` | 3 | — | canary: coffee booking | drop |

### PostgREST `db_schema` exposure

- 14 entries, 12 `app_*`. **0 stale** (no `PGRST002` landmine armed right now — good).
- 5 schemas exist but aren't exposed (`app_35694168`, `app_4220e1d9`,
  `app_6b6b8552`, `app_d286e89f`, `app_f2ccaf2e`) — harmless (all are drop
  targets), but note the deploy route's exposure bookkeeping is not reliable.
- Of the 11 drop-target schemas, **6 are currently exposed**
  (`08d38616`, `dea458d3`, `d2ea49ad`, `d388255e`, `23e6a567`, `b68d6436`) and
  **must be unexposed before the DROP** (the landmine procedure).

### Vercel projects

31 total on the team; ~19 generated-app-looking. Genuinely dead (no apps row):

- `vw-electronics-r-us-online-store-bdabac43` — deleted app, project orphaned (delete-app missed it: project name ≠ slug)
- `vw-bloom-yoga-studio-booking-app-a6a94c35` — deleted app, project orphaned
- `vw-linked-legacy-llc-booking-app-d286e89f` — abandoned regen
- 10 × `vw-canary-*` — canary leftovers (candles ×2, law ×2, plumbing ×2, salon ×2, coffee ×2)

Keep (false-positives in the audit — they *are* live apps, just missing a stored
`vercel_project_id`): `vw-sunny-day-spa-…-741aa936`, `vw-peak-performance-gym-e5fcbdd6`,
`vw-green-blade-lawn-care-…-c0640777`, `vw-automation-test-studio-…-a8f2042a`,
`vw-linked-legacy-permanent-jewelr-3f6587bd`.

### Headline findings

1. **The canary is the #1 debris source.** It creates ~2 schemas + ~2 Vercel
   projects per intake per run and never tears them down. 10 of the 12 orphan
   schemas and 10 of the 13 dead Vercel projects are canary residue. Canary
   teardown is a Tier 0 item, not a nice-to-have.
2. **`apps.vercel_project_id` is only populated on the 2 newest rows.** The
   delete-app path leans on guessing the project name from `deploy_url`. Backfill
   the column and make deploy always write it.
3. **`PGRST002` landmine is currently disarmed** but the deploy route's
   `db_schema` bookkeeping drifts (5 mismatches). `reconcilePostgrestSchemas()`
   covers the dangerous direction; the harmless direction still needs a fix.
4. One unrecoverable row (`3f6587bd`, `code = NULL`) and one zombie row
   (`a726f49a`) — both from non-transactional writes (failure #7).

---

## Step 0 — Establish a clean baseline

**Goal:** the platform at a known-good zero, so anything broken after this line is
something we introduced *after* the freeze.

- [x] **0.1** `scripts/cleanup-baseline.mjs` written (idempotent, dry-run by
      default, `--apply` to execute). Unexposes all target schemas from
      `db_schema` in one PATCH, GETs the config back and asserts they're gone,
      then `DROP SCHEMA … CASCADE`, then deletes the paired Vercel projects,
      then the zombie row. Never DROPs before the exposure removal is confirmed.
      Hard-aborts if a target schema holds rows in a non-settings table unless
      that target is explicitly flagged `seed: true`.
      **Note:** the 10 canary schemas contain canary *demo fixtures* (fake
      names, `(512) 555-01xx` phones, `@example.com` emails, bulk-inserted in
      the run window) — verified 2026-09-10 and flagged `seed: true`. Reinforces
      **T0.4**: the canary seeds demo content and never tears it down.
- [x] **0.2** Dropped 11 schemas (`app_08d38616 app_dea458d3 app_d2ea49ad
      app_4220e1d9 app_d388255e app_35694168 app_23e6a567 app_f2ccaf2e
      app_b68d6436 app_6b6b8552 app_d286e89f`) — 2026-09-10 via
      `cleanup-baseline.mjs --apply`. 6 unexposed from `db_schema` first,
      verified, then dropped.
- [x] **0.3** Deleted 13 dead Vercel projects (10 `vw-canary-*`,
      `vw-electronics-r-us-online-store-bdabac43`,
      `vw-bloom-yoga-studio-booking-app-a6a94c35`,
      `vw-linked-legacy-llc-booking-app-d286e89f`). Team project count 31 → 18.
- [x] **0.4** Deleted zombie `apps` row `a726f49a`.
- [x] **0.5** Re-ran `baseline-audit.mjs` — end state as expected: **5 apps
      rows**, **6 tenant schemas** (`741aa936 e5fcbdd6 c0640777 a8f2042a
      3f6587bd ef6ca6a6`), 1 orphan = `app_ef6ca6a6` (parked, Linked Legacy
      real data), **0 stale `db_schema` entries**, **0 unexposed live
      schemas**, 6 generated-app Vercel projects. Remaining "stuck" row =
      `3f6587bd` (Linked Legacy, `code=NULL`) — parked on the legacy track.
- [x] **0.6** Nothing on the legacy track touched.

**Step 0 complete.** Platform is at a known-good zero. Next: Tier 0.

---

## Tier 0 — the pipeline cannot corrupt itself

_Blocks the end of the build freeze. Estimate: a few days._

**Tier 0 complete (2026-09-10)** — `tsc --noEmit` clean across all changes;
migration `076` applied; `vercel_project_id` backfilled on every row. Not yet
exercised end-to-end by a real build — that's the Tier 1 proving run. Not yet
committed.

- [x] **T0.1 — Transactional deploy writes.** _(migration
      `20240101000076_deploy_pending_columns.sql`; `app/api/deploy/route.ts`,
      `app/api/generate/route.ts`, `app/api/admin/redeploy/route.ts`,
      `lib/database.types.ts`)_
      - Added `apps.pending_generated_code` / `pending_deploy_url`.
      - `runDeploy` builds from `pending_generated_code || generated_code`
        (`source`). Migration parse, file parse, and deployment all read
        `source`.
      - **Step 9 is the only place the pipeline advances `generated_code`:** on
        a fully successful deploy it does one PATCH —
        `generated_code := source`, `pending_generated_code := null`,
        `deploy_url`, `status:"deployed"`, `failure_reason:null`.
      - Deploy **repair** path now stages the repaired blob in
        `pending_generated_code` (not `generated_code`), and only if it passes
        `validateRawOutput` and is >200 chars. A failed repair redeploy can no
        longer overwrite the last good source.
      - Deploy failure branch clears `pending_generated_code`; `generated_code`
        is never touched on failure.
      - `/api/generate` refuses to persist an empty/`<200`-char blob as
        `status:"ready"` — marks `failed` + alerts instead (this was the
        "generated_code NULL, status stuck" symptom).
      - `tsc --noEmit` clean.
      - **Follow-up (not blocking):** the human change-request flow in
        `lib/apps/redeploy.ts` still writes `generated_code` directly. It has
        its own `app_revisions` rollback, so it's lower risk — fold it onto the
        same `pending_` pattern in a later pass. A dedicated `build_failed`
        status (retryable, distinct from `failed`) also deferred — `failed` +
        `failure_reason` is sufficient for now and no status is left transient.
- [x] **T0.2 — Category is immutable on edit.** _(`app/api/apps/route.ts`,
      `app/api/generate/route.ts`, `app/onboard/OnboardForm.tsx`)_
      - PATCH `/api/apps` pins `category` and `secondary_categories` to the
        stored values and rewrites `intake.category` to match, unless the body
        carries `changeCategory: true`. A mismatched category on a plain edit
        is logged and ignored, not applied.
      - POST `/api/apps` (and PATCH with `changeCategory`) validate the
        category against the 7 known `AppCategory` values — a garbage/absent
        category is now a 400, not a silent "booking".
      - PATCH no longer nulls `generated_code` / `deploy_url` on edit — the
        regeneration stages into `pending_generated_code` (T0.1) and the live
        app stays reachable until the rebuild deploys.
      - `/api/generate`: a regeneration (row already has `generated_code`)
        writes the new blob to `pending_generated_code`, not `generated_code`.
      - `OnboardForm`: `categorySelected` now requires a real
        `initialData.category`; an edit whose `intake_data` has no category
        forces the user through step 2 instead of sailing past on the
        `DEFAULT_FORM` default. `recordInitialRevision` already idempotent.
      - `tsc --noEmit` clean. No migration.
- [x] **T0.3 — Regenerate guard.** _(`lib/apps/tenantSchema.ts`,
      `app/api/apps/route.ts`, `app/onboard/OnboardForm.tsx`)_
      - New `tenantCustomerRowCounts(appId)` in `tenantSchema.ts` — counts rows
        in every tenant data table (excludes the settings tables), returns the
        non-empty ones. Verified against live schemas (`app_ef6ca6a6` →
        `appointments:7, invoices:5, …`; a missing schema → `[]`).
      - PATCH `/api/apps` calls it before flipping to `generating`; if anything
        comes back it returns **409 `has_customer_data`** with the table/row
        breakdown, unless the body carries `discardData: true`.
      - `OnboardForm` now surfaces the real server error string instead of a
        generic "something went wrong", so the owner sees why.
      - `tsc --noEmit` clean. No migration.
      - **Note:** the surgical change-request flow
        (`/api/apps/[appId]/revisions` → `redeploy.ts`) is not guarded — it
        patches files rather than re-running the migration. Revisit if a change
        request is ever allowed to touch the migration file.
- [x] **T0.4 — Canary teardown.** _(`app/api/cron/canary-build/route.ts`,
      `lib/apps/tenantSchema.ts`)_
      The old step-2 teardown leaked (audit: ~10 schemas, ~12 projects). Two
      bugs, both fixed:
      - **Null `vercel_project_id` skipped the project delete.** New
        `deleteCanaryVercelProject()` tries the stored id, then the
        deterministic project name (`vw-<slug>-<appId8>`, same formula as
        `slugify` in the deploy route). 404 is treated as "already gone".
      - **The row was deleted even when the schema drop failed**, orphaning the
        schema. Now each row is deleted only after `tenantSchemaExists(appId)`
        (new export) confirms the schema is actually gone; otherwise the row is
        kept and the next run retries.
      - Added a `reconcilePostgrestSchemas()` sweep after the loop to heal any
        stale `db_schema` entry from a past partial failure.
      - `tsc --noEmit` clean. No migration.
- [x] **T0.5 — Backfill + always-write `vercel_project_id`.** _(`app/api/deploy/route.ts`;
      `scratchpad/backfill-vercel-project-ids.mjs`)_
      - `runDeploy` step 6 no longer swallows the `vercel_project_id` write
        failure silently — it logs. Step 9 (the atomic success PATCH) now
        writes `vercel_project_id` again, so a blip in step 6 self-corrects.
      - Backfill script matched each row to its Vercel project by the
        deterministic name, then deploy_url host. **Applied 2026-09-10** — all
        4 legacy rows updated (`741aa936 e5fcbdd6 c0640777 a8f2042a`);
        `3f6587bd` was already set. Every `apps` row now has
        `vercel_project_id`.
      - delete-app already tries `vercel_project_id` first — no change needed
        there; the backfill makes that path reliable.
      - `tsc --noEmit` clean.
- [x] **T0.6 — `db_schema` bookkeeping.** _(`lib/apps/tenantSchema.ts`,
      `app/api/cron/db-health/route.ts`)_
      - `reconcilePostgrestSchemas()` is now two-way: still **removes** exposed
        `app_<hex8>` entries with no schema (the 503 landmine), and now also
        **adds** any `app_<hex8>` schema that exists *and* has a live
        `public.apps` row but isn't exposed (that app's REST calls would 404).
      - An orphan schema (exists, no apps row — e.g. the parked
        `app_ef6ca6a6`) is left untouched: not removed, not added. So the
        two-way heal can't re-break Linked Legacy.
      - Returns `{ removed, added, kept }`; `db-health` reports both in its
        detail line.
      - It already runs from `db-health` (on a 503) and canary teardown (T0.4).
        **Not** added to the hot deploy path — deploy's targeted
        `exposeSchemaInPostgREST(SCHEMA)` already covers the new app, and a
        full reconcile per deploy would scan all of `pg_namespace` + `apps`
        every time.
      - `tsc --noEmit` clean. No migration.
- [x] **T0.7 — Verify the landmine fix is live.** _(`scratchpad/verify-landmine-fix.mjs`, read-only)_
      - `db-health` cron: `system_health[supabase_rest]` = `ok:true`,
        `detail:"ok"`, updated 5 min ago → running green on its 10-min
        schedule.
      - `reconcilePostgrestSchemas` diff against live state: 0 stale (landmine
        not armed), 0 missing, and `app_ef6ca6a6` correctly classified
        "leave alone" — confirms the two-way heal won't re-break the parked
        Linked Legacy schema.
      - Live anon REST probe (`/rest/v1/apps?select=id&limit=1`) → 200, no
        `PGRST002`.
      - The destructive "arm a fake stale entry, watch it get removed" test was
        **not** run — it deliberately arms the platform-wide 503 for the test
        window. The unexpose→verify→PATCH write path was already exercised
        against 6 real schemas by `cleanup-baseline.mjs --apply` (Step 0.2).

---

## Tier 1 — build before you deploy

_Highest ROI single change._

Today: deploy to Vercel and hope; a type error surfaces minutes later and the
repair loop gets ~2 attempts before the customer sees `build_error`.

**Tier 1 code complete (2026-09-10)** — `tsc --noEmit` clean. Validated
end-to-end against a real generated app (see T1.2). Ships **off by default**
(`BUILD_PREFLIGHT` env var) until the proving build confirms it in prod.

- [x] **T1.1 — Sandbox preflight.** _(`lib/apps/sandboxBuild.ts` new;
      `app/api/deploy/route.ts`)_
      `preflightBuild()` spins up a **Vercel Sandbox** (`@vercel/sandbox`,
      `node22`, 4 vCPU), writes the post-`patchFiles` file set, runs
      `npm install` then `next build`. Wired into `runDeploy` as **step 4c —
      before `getOrCreateVercelProject`**. Measured: sandbox up ~0.3s, install
      ~21s, a clean `next build` ~5–35s.
- [x] **T1.2 — Repair loop against real compiler output.** Each failed
      `next build` → `extractBuildErrors()` → `repairGenerated()` → re-sync
      only the changed/removed files to the sandbox → rebuild. Default **4**
      repair attempts (`maxIterations`), each ~seconds of build + one Claude
      call. End-to-end test (`scripts/test-preflight.mjs`, Sunny Day Spa):
      build 1 failed → repair (2 rounds) → **build 2 green**, `ok:true,
      iterations:2, repaired:true`, 176s total.
- [x] **T1.3 — Only a green build deploys.** On `ok:true`, `runDeploy`
      continues with the (possibly repaired) files; a repaired set is also
      staged to `pending_generated_code`, and **step 9 promotes the exact
      bytes that were deployed** (`deployedSource`), not the pre-preflight
      source. On `ok:false` it throws `PreflightError` **before** any Vercel
      project is created.
- [x] **T1.4 — Clean failure.** `PreflightError` is distinct from
      `BuildError`: it does **not** trigger the deploy route's own
      repair-and-redeploy (that budget is already spent), goes straight to
      `status:"failed"` / `failure_reason:"build_error"` with the compiler
      output attached to the operator alert, and clears
      `pending_generated_code` (T0.1). No Vercel project, no broken
      `deploy_url`.
      **Fail-open on infra:** if the sandbox can't be created or errors
      mid-run, or the repair callback throws, `preflightBuild` returns
      `ok:"skipped"` and `runDeploy` falls through to the normal deploy — the
      Vercel build stays the backstop. Never block a customer on our infra.

**Rollout:**
- `BUILD_PREFLIGHT` env var: unset/`"off"` → preflight skipped (current
  behaviour); `"build"` → preflight active. **Currently ship with it off.**
- Sandbox auth: in the Vercel runtime `Sandbox.create()` uses the injected
  OIDC context. `sandboxBuild.ts` passes explicit creds only if
  `VERCEL_API_TOKEN` + `VERCEL_TEAM_ID` + `VERCEL_PROJECT_ID` are all set
  (the SDK rejects a partial set).
- Deps added: `@vercel/sandbox` (dependency); `tsx` + `ws` (devDependencies,
  for `scripts/test-preflight.mjs` only).
- **Proving step:** run `node --import tsx scripts/test-preflight.mjs` in the
  target env (or let one real build run with `BUILD_PREFLIGHT=build`), confirm
  `ok:true`, then set the env var in Vercel prod.

Removes failure classes 1 and 2 outright and most of the repair whack-a-mole.

### Incident: `BUILD_PREFLIGHT=build` go-live (2026-09-11)

Setting `BUILD_PREFLIGHT=build` in prod surfaced two things, both now fixed:

1. **Migrations `076` and `078` were never actually applied**, despite an
   earlier confirmation — verified directly against the DB and applied both
   live. Until then, `runDeploy`'s first query (selecting
   `pending_generated_code`) crashed immediately, so **every generated-app
   deploy had been failing outright** since Tier 0/1 (#25) went live, and
   `/admin` silently showed "0 apps" (its `build_notice` select 400ing).
2. Triggering a fresh canary run to prove the fix live: 4/5 deployed clean,
   `invoicing` sat in `ready` for ~20 min and was reaped as `failed (timeout)`.
   Traced via Vercel runtime logs (not guessed) to a **pre-existing gap**: the
   generate→deploy handoff is a bare un-awaited `fetch(...).catch(...)` fired
   right before the response finishes, which can be silently dropped when the
   execution context tears down. Fixed (PR #28) by moving all three internal
   fire-and-forget triggers (generate→deploy, generate auto-retry,
   deploy repair-redeploy) onto `after()`; `reap-stuck-builds` now also sets
   `build_notice` when it force-fails a stuck row; `preflightBuild()` gained a
   3-minute wall-clock cap as defense in depth (not the cause here, but a real
   latent risk once preflight runs before "deploying" is set).

**Lesson:** don't trust an unverified "columns are there" — check the DB
directly before treating a migration as applied.

---

## Client exposure to the build process

_Done 2026-09-10. The client sees coarse phases and outcomes — never code,
compiler errors, or repair counts. A hard failure is acknowledged ("we've run
into an issue") with a live update panel, never the raw word "failed"._

- [x] **Single source of truth: `lib/apps/clientStatus.ts`.** `clientBuildState()`
      maps a DB status (+ optional live stream phase + `build_notice`) to
      `{ phase, headline, sub, done, settling, notice, noticeAt }`. A hard
      failure (`failed` / `deploy_failed`) resolves to `settling: true` —
      headline "We've run into an issue", plus the notice — never a raw
      failure. `/admin` does not import this and still shows the real status.
- [x] **`/generate` is phased progress only, no code.** `/api/generate` stops
      streaming generated code to the browser; it emits `[[PHASE:designing|
      building|reviewing]]` markers and `[[TICK]]` heartbeats (every ~8s to
      keep the connection warm). `GenerateClient.tsx` rewritten to a 5-step
      stepper (Designing → Building → Reviewing → Publishing → Live), driven by
      those markers then by polling `apps.status`. A gentle in-phase progress
      crawl so the bar is never frozen. The `[Checking… N things to fix]` /
      `[Planned the app structure…]` lines are gone. Preview/canary path
      unchanged (never wrote to the stream).
- [x] **Update panel on failure.** Migration `078` adds `apps.build_notice` /
      `build_notice_at`. On a hard failure the pipeline auto-writes
      `DEFAULT_BUILD_NOTICE` ("…our team was notified automatically and is
      working to resolve it…"); `/generate` shows it in a "Latest update" panel
      with a relative timestamp, and keeps polling ~45 min so operator
      follow-ups and an eventual deploy appear without a refresh. Cleared on a
      successful deploy.
- [x] **Operator can post updates.** `/api/admin/build-notice` + a
      "Post update" / "Edit update" button on failed rows in the `/admin` apps
      table. The operator's custom text is preserved across a subsequent
      auto-failure (only the default notice is overwritten).
- [x] **Dashboard.** `failed` / `deploy_failed` → amber "We're on it" badge +
      the `build_notice` text on the card; a top banner ("one of your apps hit
      a snag — we're on it and this page updates automatically"); the dashboard
      now polls through the failed state too, so an operator fix flips the card
      to "Live" in front of the customer. No red, no client-facing retry.
- [x] **No automated "it failed" email to the customer.** The promised email
      is the existing "your app is live!" one, sent when the operator's fix
      deploys. `notifyBuildFailure` (operator alert, full detail) is unchanged.
- **Accepted trade-off:** a `failed` app the operator never fixes leaves the
  customer with a stale update and no live app. Mitigation: the operator alert
  is loud; `/admin` shows the true `failed` state and the update control.
  _(Follow-up: make `/admin` surface stuck failed builds more prominently.)_

---

## Tier 2 — shrink what the LLM writes

_The durable fix. Code done 2026-09-10; needs cross-category proving (below)._

The reason Replit / Bolt / Lovable are stable: a fixed, CI-tested scaffold; the
model only fills ~10 domain files. VisionWorkx had the model emit the *entire*
app — `package.json`, tsconfig, config, the Supabase clients — so every config
file was a failure surface.

- [x] **T2.1 — `templates/base/`** (10 real, reviewable files): `package.json`
      (canonical deps, Next 14 pinned), `tsconfig.json`, `next.config.mjs`
      (`eslint.ignoreDuringBuilds` — lint nits no longer fail a customer build;
      `next build` still type-checks), `tailwind.config.ts` (the theme-token
      map), `postcss.config.js`, `next-env.d.ts`, `.gitignore`,
      `.env.local.example`, `lib/supabase.ts`, `lib/supabase-server.ts`.
      `scripts/gen-base-template.mjs` (`npm run gen:base`) bakes them into
      `lib/apps/baseTemplate.generated.ts` so the deploy function needs no
      runtime FS access. `templates/` excluded from the platform tsconfig.
- [x] **T2.2 — generator emits domain files only.** SYSTEM_PROMPT rewritten:
      the 10 base paths are listed as platform-provided ("anything you write
      there is discarded"); the two big Supabase-client code blocks and the
      "pin next to ^14.2.0" instruction are gone. **Package allowlist:** only
      `next react react-dom @supabase/ssr @supabase/supabase-js lucide-react`
      are installed. `validateGenerated` flags a disallowed `import` and flags
      any emitted platform-owned path (so the repair pass stops working on it).
- [x] **T2.3 — deploy assembles from the base.** `patchFiles()` now opens with
      `applyBaseTemplate()` — drop any platform-owned path the model emitted,
      lay the base under the domain files. Deleted from `patchFiles`: the
      inline `next.config` / `tailwind.config` / `tsconfig` / `package.json`
      injection blocks **and the entire Next-14 clamp block**. Kept: the
      wrong-import rewrite, hex-colour fixer, null-filter fixer, `.env.production`
      strip, truncation fallbacks (remove once the canary is trusted). Preflight
      + `scripts/test-preflight.mjs` both build from the same assembled set.
- [x] **Proving — all 5 golden categories.** `booking` via
      `scripts/test-preflight.mjs` (Sunny Day Spa, saved blob) and
      `booking_crm` / `invoicing` / `portal` / `storefront` via the new
      `scripts/gen-and-preflight.mjs` (a real generation each — plan → implement
      → validate/repair → base-template assembly → sandbox preflight, no DB
      writes). Found and fixed one real gap along the way: the "QR code"
      intake feature imports `qrcode`, which the allowlist rejected — added it
      to `templates/base/package.json` + `ALLOWED_PACKAGES`. Result: **all 5
      PASS**, each green on the first preflight attempt (`validateGenerated`'s
      existing repair caught everything pre-sandbox). There is still no feature
      flag on Tier 2 — this is live on merge. **Next:** set
      `BUILD_PREFLIGHT=build` in Vercel; keep the build freeze until the canary
      is green 10 nights.

Kills failure class 1 permanently; shrinks class 2; removes most of class 7's
surface area.

---

## Tier 3 — make the gate mean something

_Started 2026-09-11._

- [x] **T3.1a — the fast gate is real.** `.github/workflows/ci.yml` (already
      existed, tsc + vitest + `next build` on every push/PR) was running but
      **not enforced** — no branch protection, so a red CI never blocked a
      merge. Also added a `templates/base` drift check (regenerates
      `baseTemplate.generated.ts` and diffs it against the committed version —
      catches editing `templates/base/**` without `npm run gen:base`).
      **Needs a one-time manual step** (blocked for the agent, same class as
      the Vercel env write): make the `check` job a required status check on
      `main`. Run once, by you:
      ```
      gh api -X PUT repos/Revalor01/VisionWorkx/branches/main/protection \
        -H "Accept: application/vnd.github+json" \
        -f 'required_status_checks[strict]=true' \
        -f 'required_status_checks[contexts][]=check' \
        -F 'enforce_admins=false' \
        -F 'required_pull_request_reviews=null' \
        -F 'restrictions=null' \
        -F 'allow_force_pushes=false' \
        -F 'allow_deletions=false'
      ```
- [x] **T3.1b — the slow/expensive gate, packaged and operator-triggered.**
      `scripts/run-golden-canary.mjs` fires a fresh golden batch against
      whatever's currently deployed and polls to a clear pass/fail — the same
      thing done by hand during the `BUILD_PREFLIGHT` incident, now a
      reusable command. Wired as `.github/workflows/golden-canary.yml`
      (`workflow_dispatch`, manual — a full cycle is 15–45 min and costs real
      AI + compute, so it's not on every push). Needs repo secrets
      `CRON_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` added for the
      Action to use it (the script also runs from `.env.local` locally with no
      setup). Run it after any change to a risk-surface file before trusting
      it: `app/api/generate/route.ts`, `lib/apps/repairGenerated.ts`,
      `lib/apps/validateGenerated.ts`, `app/api/deploy/route.ts`,
      `lib/apps/baseTemplate.ts`, `templates/base/**`.
- [x] **T3.2 — regression tests from this session's real incidents.**
      `lib/apps/baseTemplate.test.ts` (new): platform-owned paths get
      discarded and replaced, `qrcode` is allowlisted (the actual bug found
      while proving Tier 2), a random package is correctly flagged, local/
      relative/framework imports are never flagged. `validateGenerated.test.ts`
      fixtures updated for the Tier 2 contract. 95 tests total, all green.
- [x] **T3.3 — `tsc --noEmit` in-pipeline.** Already true via CI (every push)
      and now also inside `preflightBuild()` itself: each sandbox attempt runs
      `tsc --noEmit` before the full `next build` — a fraction of the cost,
      and type errors are the dominant failure class, so this fails fast and
      leaves more of the wall-clock budget for repair. **Recalibrated the
      budget on real measured data** while testing this: a single
      `repairGenerated()` call has its own internal 2-round retry and can take
      up to ~4 min end to end (measured), not the ~1 min assumed when Tier 1
      shipped. Default `maxWallClockMs` raised 3→4 min, default
      `maxIterations` lowered 4→2 (redundant on top of repairGenerated's own
      2 rounds; tightens the worst case instead of chasing a diminishing
      return). Still fails open (`ok:"skipped"`, never a false failure) if the
      budget runs out.
- [ ] **T3.4** Canary asserts the running app (redirect loop, Next-15 marker
      leak, 5xx) — already partly done in `smokeCheck`; extend per new
      failure. Not touched this pass.
- [x] **Bonus: `/admin` "Build Outcomes" panel.** Real (non-canary) apps now
      have a 7d/30d/all-time table — total, deployed, failed, deploy-failed,
      in-progress, and **% complete** (deployed ÷ terminal-state apps, so a
      still-building app isn't penalized) — plus a ranked **"top failure
      reasons"** bar list combining real-app and canary failures, tagged by
      source. This is the "where do I focus next" view; the per-category
      canary grid also gained a 7d figure alongside the existing 30d one.

---

## Definition of "sellable" — the freeze lifts when all are true

- [ ] Step 0 done; `baseline-audit.mjs` shows the expected clean end state.
- [ ] Tier 0 complete.
- [ ] Tier 1 complete (sandbox build gates every deploy).
- [ ] Canary green **10 consecutive nights**, including one intake that
      regenerates an app and one that deletes an app.
- [ ] One deliberate end-to-end by hand: build → edit → regenerate → take a
      Stripe test payment → delete — with **zero manual DB surgery**.
- [ ] First proving build: **Electronics R Us as a storefront** through the
      fixed pipeline, clean start to finish.

---

## Workstream B — legacy backlog (PARKED — do not start until A is done)

Touch none of this during Tiers 0–3.

- **Linked Legacy Permanent Jewelry** — `apps` row `3f6587bd` has
  `generated_code = NULL`; its real data (7 appointments, 6 contacts, 5
  invoices, 4 services) is stranded in orphan schema `app_ef6ca6a6`, which was
  re-exposed and had its `emit_automation_event` triggers hand-repointed to
  `3f6587bd` earlier. Options when we get to it: (a) rebuild `generated_code`
  and re-point the row at `app_ef6ca6a6`, or (b) migrate the 4 tables' rows
  from `app_ef6ca6a6` into `app_3f6587bd` and retire `ef6ca6a6`.
- **4 healthy legacy booking apps** (`741aa936` Sunny Day Spa, `e5fcbdd6` Peak
  Performance Gym, `c0640777` Green Blade Lawn Care, `a8f2042a` Automation Test
  Studio) — running fine on old generations. Re-baseline onto `templates/base/`
  when convenient. No urgency.
- Keep `app_ef6ca6a6` and both `vw-linked-legacy-*-3f6587bd` /
  `-ef6ca6a6` Vercel projects until Linked Legacy is resolved.
