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

## Nightly run
Every day at 11:00 UTC (7 am Eastern) GitHub Actions runs **every** test of
**every** product in `qa/products.json` against production (one job per
product; each suite takes a minute or two). Each product's run appears in
/admin/qa as *nightly*. If it fails, the operator gets an email listing the
failed tests with a link to the run; the first green night after a red one sends
a "green again" email. Normal green nights send nothing (`lib/qa/notify.ts`).
If a scheduled run dies before it can report, GitHub's own failed-workflow email
covers it. Change the time in the `schedule:` cron in `qa-run.yml`.

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
| Google Calendar | bookings added/moved/removed on the calendar; busy times hide slots and open up again (QA Google account) |
| Manual checks | /start email link, Stripe Connect onboarding, Google consent screen, disconnect revokes access, reminder email arrives |
| Not yet | Stripe trial/upgrade/cancel and deposits (needs Stripe **test** keys in Vercel Preview) |

## Google Calendar tests (QA Google account)
`revalor.qa@gmail.com` is connected **once, by hand** to the permanent
**Revalor QA Calendar** workspace (a normal, non-test workspace). Calendar
tests call `connectQaCalendar(workspaceId)`, which copies that saved,
encrypted connection into their throwaway workspace — no Google password or
token ever goes to GitHub. Rules:
- **Never click Disconnect on Revalor QA Calendar**, and never call the
  app's disconnect on a copied connection: it revokes the grant for every test.
- If calendar tests start failing with "No active Google Calendar connection",
  sign in as the QA account and reconnect in that workspace's Settings.
- Tests cancel their bookings in `finally` so their events are removed from
  the QA calendar even when a step fails.

## Manual checks
`qa/products/<product>/manual.json` lists checks a robot can't do. They sync
with the catalog and show on the product page with Passed / Failed / Skip
buttons and a note (stored in `vw_qa_manual_checks`).

## Adding a product
1. Add it to `qa/products.json` (slug → name + production URL).
2. Add `qa/products/<slug>/*.qa.ts` (and `manual.json`), with product-specific
   sign-in/data helpers in `qa/lib/<slug>.ts`.
3. Add its database secrets to GitHub and pass them in `qa-run.yml`'s `env:`.

That's all: on its next run the catalog sync registers the product in
/admin/qa (new card), and the nightly run picks it up from `products.json`.
Each product gets its own Playwright projects (`<slug>` and `<slug>-mobile`)
with its own URL, and `QA_PRODUCT` limits a run to one product. Other Revalor
products are tested black-box against their live URLs from this repo — their
own repos aren't touched.

## Billing tests (Stripe sandbox, preview only)
`qa/products/visionworkx/billing.qa.ts` tests real billing against the
**Vision Workx Stripe sandbox** (`acct_1UE7GCBedYJHvzis`, test mode):
starting the 14-day trial through Stripe's hosted checkout (card 4242), a plan
change syncing from Stripe, and cancellation pausing live forms.
- They only run when the target is a **preview** (`QA_TARGET_ENV=preview`) and
  `STRIPE_TEST_SECRET_KEY` is a test key; on production they skip. `qa/lib/stripe.ts`
  refuses live keys.
- Vercel **Preview** env has the sandbox keys, the six sandbox price IDs (lookup
  keys `vw_<plan>_<monthly|annual>`), and `STRIPE_WEBHOOK_SECRET` = the Stripe
  CLI's `stripe listen` signing secret.
- In the workflow, `stripe listen --events … --forward-to <preview>/api/webhooks/stripe`
  forwards sandbox webhooks to the preview for the run (the Vercel protection
  bypass header is added). The run log ends with every delivery and its status.
- Test workspaces start with no plan (`billingStatus: "none"`); every Stripe
  customer a test makes is deleted afterwards.
- To run: /admin/qa → VisionWorkx → *A preview deployment…* → paste a preview URL.
- Deposits (Stripe Connect) aren't covered yet.

## Consumer web apps on the shared template (Sanctum, Proactive)
Sanctum and Proactive are built from the same template (own Supabase project,
tiers on `users_profile.subscription_tier`, `onboarding_state`, a localStorage
disclaimer flag, password login, AI chat via the Supabase function `chat`).
`qa/lib/templateApp.ts` holds the shared helpers; `qa/lib/sanctum.ts` and
`qa/lib/proactive.ts` configure it (env prefix, disclaimer key, tables that
don't cascade). A future app on the same template is a new ~20-line file.

## Proactive (web app)
Tests in `qa/products/proactive/` run against https://proactive-zeta-three.vercel.app.
Same fixture pattern as Sanctum (`proactiveUser({ tier })`, `proactiveLogin`,
`mockCollaborator`). Proactive calls its plus tier **Entry**; Collaborator (the
AI) is Premium and always simulated. Coverage: public pages, signed-out
redirects, login, disclaimer, onboarding, Temperature Check, journal,
Prioritization (read + Collaborator hand-off), decision tools open for Free,
Entry gates, Insights cap, Collaborator upsell and chat, payment self-upgrade
blocked, invalid test code, profile, admin refused. Proactive's own `e2e/`
tests are ported. Manual: sign-up email, Stripe checkout, reminder email, a
real Collaborator reply. Secrets: `PROACTIVE_SUPABASE_URL`,
`PROACTIVE_SUPABASE_SERVICE_ROLE_KEY`.

## Sanctum (web app)
Tests in `qa/products/sanctum/` run against https://sanctum-web-xi.vercel.app
(the Sanctum **web** app). Helpers in `qa/lib/sanctum.ts` use plain REST calls
to Sanctum's own Supabase project.
- The `sanctumUser` fixture makes throwaway `qa+…@example.com` users at a tier
  (`free` / `plus` / `premium` / `test`), with onboarding skipped unless
  `onboarded: false`; after the test it deletes them and everything they wrote
  (check-ins and journal entries are deleted explicitly — those tables don't
  cascade). The global setup sweeps leftovers older than 3 hours.
- `sanctumLogin` logs in through the real login page and pre-accepts the 18+
  disclaimer (except where a test checks the disclaimer itself).
- **Tessa is always simulated** (`mockTessa`) — no real AI calls, no test
  messages through the real model.
- Phone numbers in tests are fictional 555-01xx numbers; the SMS opt-in test
  turns SMS off again straight away.
- Coverage: public pages, signed-out redirects, login, disclaimer, onboarding,
  check-in, journal, crisis banner (journal + Tessa), crisis resources, plan
  gates (free/Plus/Premium), payment self-upgrade blocked, invalid test code,
  emergency contacts, SMS opt-in, profile, admin page refused. Sanctum's own
  `e2e/` tests are ported here. Manual: sign-up email, Stripe checkout,
  reminder email, a real Tessa reply.

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
| GitHub secret | `SANCTUM_SUPABASE_URL`, `SANCTUM_SUPABASE_SERVICE_ROLE_KEY` | Sanctum's Supabase project |
| GitHub secret | `PROACTIVE_SUPABASE_URL`, `PROACTIVE_SUPABASE_SERVICE_ROLE_KEY` | Proactive's Supabase project |
| GitHub secret (optional) | `VERCEL_AUTOMATION_BYPASS_SECRET` | for protected previews |
| GitHub variable (optional) | `QA_REPORT_URL` | defaults to https://vision-workx.vercel.app |

Migrations: `supabase/migrations/20240101000092_vw_qa.sql` (**main** project)
and `supabase-modules/migrations/20260928000010_vw_workspace_is_test.sql`
(**visionworkx-modules**, `vgyvycepumnrtseciofx`).
