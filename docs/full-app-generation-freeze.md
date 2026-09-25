# Full-app generation freeze (A3) — 2026-09-25

VisionWorkx is moving from generating and hosting whole apps to **embeddable website
modules** (see products.revalorllc.com/visionworkx/preview). Starting new full-app builds is
now **off by default**.

## The switch
- `FULL_APP_GENERATION` (Vercel env var). **Unset / anything but `true` = frozen.**
  Set `FULL_APP_GENERATION=true` (and redeploy) to re-open the builder.
- The operator (`ADMIN_EMAIL`) can still build while frozen, for testing.
- Code: `lib/featureFlags.ts` (+ `lib/featureFlags.test.ts`), UI notice
  `components/GenerationPaused.tsx`.

## What's gated while frozen
| Path | Behaviour |
|---|---|
| `POST`/`PATCH /api/apps`, user `POST /api/generate` | 403 `generation_paused` |
| `POST /api/try` (anonymous previews) | 403 — test-mode codes (no build) still work |
| `POST /api/guided` ($10 guided session) | 403 |
| `POST /api/apps/[id]/revisions` (change requests) | 403 |
| `POST /api/create-checkout` (plan checkout) | 403 |
| Cron `canary-build` | Skips (same as `CANARY_DISABLED=true`) |
| `/onboard`, `/generate`, `/billing`, `/try/*`, `/guided/*` pages | "New app builds are paused" notice → waitlist |
| Dashboard | Existing apps still listed; "Create app" and "Edit" hidden |
| Landing / pricing / web-app-vs-web-page CTAs | Point to the waitlist or the module preview |

**Not gated:** existing deployed apps keep running; `/api/deploy` and admin redeploys (only
reachable server-side for existing apps); admin SSO; revalor-admin's tables and routes;
`/api/try/recommend`, `lib/apps/recommendBuild.ts`, `lib/apps/generatePlan.ts` (prompt-to-config
code kept for configuring modules).

## Resources tied to generated apps — status and recommendation
Snapshot 2026-09-25 (read-only): 10 `apps` rows (6 deployed, 4 failed), 20 profiles,
12 subscriptions — none with a Stripe subscription id (10 trialing, 2 comped). No paying users.

| Resource | Recommendation | Decision |
|---|---|---|
| Cron `canary-build` (nightly real builds, ~$230/mo Anthropic) | Stopped by the flag | Done with this change |
| Crons `reap-stuck-builds`, `anthropic-health` | Keep for now; remove once no builds can run | |
| Crons `app-insights`, `app-automations` | Keep while deployed apps exist | |
| Cron `preview-cleanup` | Keep (removes stale previews) | |
| Cron `db-health` | **Keep** — protects the whole PostgREST API | |
| Cron `trial-ending` | Keep (harmless) | |
| revalor-automation `/api/poll` | Keep until A6 repurposes it | |
| Vercel `vw-canary-law-customer-portal-64d994d3`, `vw-canary-salon-booking-app-1f674320`, `vw-canary-plumbing-invoicing-app-3fd6e403` | Delete (failed canary leftovers) | |
| Vercel `vw-linked-legacy-permanent-jewelr-3f6587bd` | Delete (orphan — no `apps` row) | |
| Demo apps: Sunny Day Spa, Peak Performance Gym, Green Blade Lawn Care, Automation Test Studio, Linked Legacy booking | Owner: delete all old generated apps; one demo site with every module comes with A4 | Pending final confirmation |
| `apps` row "Canary Coffee" | Marked deployed but its Vercel project is gone — tidy up | |

**Tenant schemas:** any app deletion must use the existing teardown (unexpose from
PostgREST `db_schema` **before** dropping the `app_<hex8>` schema). A plain `DROP SCHEMA`
503s the entire REST API (see `/api/cron/db-health`).
