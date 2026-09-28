# Revalor QA suite

Real-browser tests (Playwright) for every Revalor product, run in GitHub
Actions and reported to **/admin/qa**.

```
/admin/qa ──(GitHub API: workflow_dispatch)──▶ .github/workflows/qa-run.yml
                                                  │ qa/sync-catalog.mjs  → catalog
                                                  │ playwright test      → results (qa/reporter.ts)
                                                  ▼
                                   /api/admin/qa/report ──▶ vw_qa_* tables + vw-qa-artifacts bucket
```

## Using it
- **/admin/qa** — one card per product (latest status, pass rate).
- **/admin/qa/<product>** — tick tests (grouped by area) or use *Run smoke*,
  *Run all*, *Re-run failing*; choose production or a preview URL.
- **/admin/qa/runs/<id>** — live results; failures open with the failing step,
  error, screenshot, video and a Playwright trace (open at trace.playwright.dev).
- A run stuck in *queued* for 15 minutes shows "didn't start" — check the
  *QA Run* workflow in GitHub Actions.

## Adding a test
Create or edit `qa/products/<product>/<area>.qa.ts`:

```ts
import { expect, qa } from "../../lib/qa";

qa({ id: "visionworkx/booking/double-booking", area: "Booking", title: "Two visitors can't book the same time" },
  async ({ page, qaWorkspace }) => { /* … */ });
```

- `id` is `<product>/<area>/<name>`, lowercase-dashes, **stable** (history is
  keyed on it). `smoke: true` adds it to *Run smoke*; `requires: ["stripe-test"]`
  shows a setup badge.
- `qaWorkspace` gives a throwaway modules workspace (is_test, comped billing,
  domain `qa-site.revalor.test`) that's deleted afterwards.
- `qaUser` gives a signed-up user with no workspace (onboarding tests).
  `test.use({ workspaceOptions: { plan, notificationEmail } })` changes the
  workspace for a file or `test.describe` block.
- `mobile: true` re-runs the test on a phone-sized screen (Pixel 7, Chromium);
  it's tracked in /admin/qa as a separate `<id>--mobile` entry.
- Helpers in `qa/lib/modules.ts`: `createModule` (insert a live module
  directly), `formConfig`/`NAME_FIELD`/`EMAIL_FIELD`, `openHostPage` (fake
  customer site with the embed), `submitViaApi` (submit as a visitor's
  browser would), `signIn` (owner session), `modulesAdmin` (service-role
  client), `waitFor`.
- **Email:** never use a real address. `resendTestAddress(label)` gives a Resend
  test inbox (`delivered+label@resend.dev`). Email tests check the modules
  `vw_email_log`, and are tagged `requires: ["automation"]` because
  revalor-automation does the sending.
- QA accounts (`qa+…@example.com`) never get welcome emails or trigger the
  operator's signup alert, and self-serve workspaces they create are marked
  `is_test` automatically (`lib/modules/testWorkspaces.ts`).
- Files are `*.qa.ts`, not `*.spec.ts`, so Vitest ignores them.
- The new test appears in /admin/qa after the next run (the catalog syncs first).

## VisionWorkx coverage
| Area | Tests |
|---|---|
| Public site | pages load, embed script |
| Signup | onboarding creates the workspace (the /start email link is a manual check) |
| Forms | embed → submit → dashboard (+phone), AI draft & publish, file upload & download, status/notes/CSV, other sites blocked |
| Quote calculator | estimate math matches pricing, lead saved with estimate (+phone) |
| Booking | slot rules, book in widget (+phone), no double-booking, customer reschedule/cancel, owner cancel, reminder queued |
| Emails | confirmation + owner alert sent (needs revalor-automation) |
| Plans & billing | Starter module cap, Growth allows more |
| Not yet | Stripe trial/upgrade/cancel and deposits (Phase 3, preview + test keys), Google Calendar (Phase 3, QA Google account) |

## Adding a product
Insert a `vw_qa_products` row (slug, name, production base_url), then add
`qa/products/<slug>/*.qa.ts`. Other Revalor products are tested black-box
against their live URLs from this repo — their own repos aren't touched. Put
product-specific sign-in/data helpers in `qa/lib/<slug>.ts`.

## Test data
Everything is created in the modules DB with `vw_workspaces.is_test = true`
and deleted after each test (only `is_test` rows and `qa+…@example.com` users).
`qa/global-setup.ts` sweeps leftovers older than 3 hours. `is_test`
workspaces are filtered out of /admin/modules and the modules directory.

## Running locally
```bash
npx playwright install chromium
# public tests only (no secrets needed):
npx playwright test -c qa/playwright.config.ts --grep @visionworkx/public
# everything (needs MODULES_SUPABASE_URL, MODULES_SUPABASE_SERVICE_ROLE_KEY,
# NEXT_PUBLIC_MODULES_SUPABASE_ANON_KEY in the environment):
npx playwright test -c qa/playwright.config.ts
QA_TARGET_URL=https://<preview>.vercel.app npx playwright test -c qa/playwright.config.ts
node qa/sync-catalog.mjs --dry   # print the catalog
```
Without QA_REPORT_URL/QA_REPORT_SECRET the reporter does nothing.

## Setup (once)
| Where | Name | Value |
|---|---|---|
| Vercel (Production) | `QA_REPORT_SECRET` | random secret |
| Vercel (Production) | `QA_GITHUB_TOKEN` | fine-grained PAT: this repo only, **Actions: read & write** |
| GitHub secret | `QA_REPORT_SECRET` | same as Vercel |
| GitHub secret | `MODULES_SUPABASE_URL`, `MODULES_SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_MODULES_SUPABASE_ANON_KEY` | visionworkx-modules |
| GitHub secret (optional) | `VERCEL_AUTOMATION_BYPASS_SECRET` | for protected previews |
| GitHub variable (optional) | `QA_REPORT_URL` | defaults to https://vision-workx.vercel.app |

Migrations: `supabase/migrations/20240101000092_vw_qa.sql` (**main** project)
and `supabase-modules/migrations/20260928000010_vw_workspace_is_test.sql`
(**visionworkx-modules**, `vgyvycepumnrtseciofx`).
