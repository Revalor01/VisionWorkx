# Stripe payments — setup & operation

How money moves through a VisionWorkx-generated app, how a customer turns
payments on, and how the platform's Stripe Connect account is configured.

- [For an app owner: turn on payments](#for-an-app-owner-turn-on-payments)
- [Test mode ("Test pay")](#test-mode-test-pay)
- [For the platform operator: one-time Connect setup](#for-the-platform-operator-one-time-connect-setup)
- [Environment variables](#environment-variables)
- [How a payment flows](#how-a-payment-flows)
- [Troubleshooting](#troubleshooting)

---

## For an app owner: turn on payments

Payment features are available on these app categories: **storefront**,
**invoicing**, **booking** (deposits), **membership** (recurring). Other
categories don't show the card.

### What "Accept payments" does

Your app charges customers through **your own** Stripe account — you own the
account, the customers, and the money. VisionWorkx only creates the Checkout
page on your behalf. VisionWorkx keeps **1%** of each payment as a processing
fee; Stripe's own fees (≈2.9% + 30¢) are separate and charged by Stripe.

### Steps

1. In your app, go to **Settings → Accept payments** and click
   **Set up payments**.
2. You're sent to Stripe's hosted onboarding. Have ready:
   - Business type (Individual / Sole proprietor / LLC / …)
   - **EIN** (business) or **SSN** (individual / the representative)
   - Legal name, business address, date of birth
   - A **bank account** for payouts (routing + account number)
3. Submit. Stripe returns you to **Settings**, which shows one of:
   - **"✓ Payments are on."** — done. Payment features are live immediately.
   - **"Stripe still needs a few details"** with **Finish payment setup** —
     a requirement is outstanding (usually the full SSN, an ID document, or
     address verification still processing). Click through and complete it.
4. Use **Open your Stripe Dashboard →** on the card to watch charges and
   payouts.

### After setup

- **Storefront** — checkout button on the store works; each order is a
  direct charge on your account.
- **Invoicing** — "Pay this invoice" links become live.
- **Booking** — deposits are collected at booking time.
- **Membership** — recurring subscriptions bill on your account.

### Payouts

Stripe pays out to your bank on its standard rolling schedule (about 2
business days per charge in the US; the first payout can take ~7 days while
Stripe verifies the account). Manage payout timing and see statements in
your Stripe Dashboard.

---

## Test mode ("Test pay")

An operator can flip **Test pay** on for any app from `/admin` → Apps. It
sets `apps.payments_test_mode = true` and clears the app's connected-account
fields so onboarding restarts against **Stripe test data** — no real money.

With Test pay ON:

| Field | Test value |
|---|---|
| Card | `4242 4242 4242 4242`, any future expiry / CVC / ZIP |
| SSN / EIN | `000-00-0000` / `00-0000000` |
| Phone | `000-000-0000` |
| Bank | choose **Test (Non-OAuth)**, or routing `110000000` / account `000123456789` |

The identity-document requirement in test mode clears on its own after a
minute or two. Flip Test pay OFF (and re-onboard) before taking real money.

---

## For the platform operator: one-time Connect setup

Done 2026-09-10. VisionWorkx runs on its **own** Stripe account, separate
from the shared Revalor account (which cannot be a Connect platform).

| | Value |
|---|---|
| Live platform account | `acct_1UE7GCBedYJHvzis` — "Vision Workx" (org: Revalor - Prime, entity: Revalor LLC) |
| Sandbox | `acct_1UE9Z1PZGPntpalM` — "Vision Workx sandbox" |
| Connect model | Platform · **Standard** accounts · **direct charges** |
| Platform fee | `PLATFORM_FEE_PERCENT=1` (application fee on every direct charge) |

### Required toggles

- **Accounts v1 support — ON, in both live and sandbox.**
  `dashboard.stripe.com/settings/features/feat_accounts_v1_support`
  The code creates connected accounts with the **v1** API
  (`stripe.accounts.create({ type: "standard" })`). New Stripe accounts
  disable v1 creation by default; without this toggle, "Set up payments"
  fails with a 502 and the log shows *"Stripe no longer recommends Accounts
  v1…"*. (Long-term: migrate `lib/apps/payments.ts` to
  `stripe.v2.core.accounts.create`; that also changes webhook event
  routing, so it's separate work.)

### Webhooks

Both created in Workbench → Webhooks, payload style **Snapshot**:

| Name | Scope ("Events from") | URL | Events |
|---|---|---|---|
| `visionworkx-connect` (live + sandbox) | **Connected accounts** (`@accounts`) | `/api/webhooks/stripe` | `account.updated`, `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed` |
| `visionworkx-promote` (live) | **Your account** (`@self`) | `/api/webhooks/stripe-promote` | `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted` |

`account.updated` for a connected account is a **Connect-scoped** event — it
must be on the `@accounts` destination or `payments_status` never flips to
`active`.

### Recreating on a new account

1. Create the account (Stripe org → **New account**), reuse **Revalor LLC**'s
   verification details, activate it.
2. Settings → Connect → enable as a **Platform**, **Standard** accounts,
   **direct charges**; fill the platform profile.
3. Enable **Accounts v1 support** (live + sandbox).
4. Create the two webhooks above; copy each signing secret.
5. Set the env vars below in Vercel (production) and redeploy — new prod env
   vars need a fresh deploy to take effect.
6. Recreate the platform's own Products/Prices (Promote tiers; and the
   Starter/Growth/Pro subscription prices when that ships).

---

## Environment variables

| Var | What |
|---|---|
| `STRIPE_SECRET_KEY` | Live secret key of the platform account. Used for every Connect call and the platform's own billing. |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Live publishable key. |
| `STRIPE_WEBHOOK_SECRET` | Signing secret of the **live** `visionworkx-connect` webhook. |
| `STRIPE_TEST_SECRET_KEY` | Sandbox secret key — used for any app with `payments_test_mode = true`. |
| `STRIPE_TEST_WEBHOOK_SECRET` | Signing secret of the **sandbox** `visionworkx-connect` webhook. |
| `PLATFORM_FEE_PERCENT` | Platform's cut of each direct charge, as a percent. `1` = 1%. Unset / 0 = no fee. |
| `STRIPE_PROMOTE_STARTER_PRICE_ID` / `_GROWTH_` / `_PRO_` | Price IDs for the Promote add-on ($19 / $49 / $99 mo) on the platform account. |
| `STRIPE_PROMOTE_WEBHOOK_SECRET` | Signing secret of the `visionworkx-promote` webhook. |
| `STRIPE_STARTER_PRICE_ID` / `_GROWTH_` / `_PRO_` (+ `_ANNUAL_`) | VisionWorkx's own subscription prices. **Still point at the old account** — recreate on the new one when subscription billing ships (PR #24). |
| `STRIPE_GUIDED_SESSION_PRICE_ID` | Optional $10 Guided Build Session price. Unset → `/api/guided` uses an inline $10 price (fine). |

The webhook handler (`app/api/webhooks/stripe/route.ts`) verifies each event
against `STRIPE_WEBHOOK_SECRET` first, then `STRIPE_TEST_WEBHOOK_SECRET`, so
one production URL serves both live and sandbox events.

---

## How a payment flows

1. The generated app calls the platform bridge (`STRIPE_CHECKOUT_URL` →
   `/api/apps/[appId]/checkout`) with its `x-vw-checkout-secret`.
2. `createConnectedCheckout` (`lib/apps/payments.ts`) creates a Checkout
   Session **on the connected account** (`{ stripeAccount }`), as a direct
   charge, with `application_fee_amount = total × PLATFORM_FEE_PERCENT%`.
3. The customer pays on Stripe's hosted page. Money lands in the app
   owner's balance; the fee lands in VisionWorkx's.
4. `checkout.session.completed` (Connect-scoped) hits `/api/webhooks/stripe`;
   the app confirms via `GET /api/apps/[appId]/checkout?session_id=…`.
5. Connected-account status changes fire `account.updated`; `syncConnectAccount`
   sets `apps.payments_status` to `active` once `charges_enabled` is true.
   The app's Settings page also reconciles opportunistically on load.

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| **"Couldn't start Stripe setup. Try again in a minute."** | `startConnectOnboarding` threw. Check prod logs for `/api/apps/[appId]/payments/connect`. Most common: **Accounts v1 support** is off on the platform account (or its sandbox). |
| Card stays on **"Finish payment setup"** after onboarding | Connected account has outstanding `requirements` — usually `person…id_number` (needs full SSN, not last-4) or `verification.document`, or address still `pending_verification`. Check with `stripe get /v1/accounts/<acct> --api-key <key>`. In test mode the doc requirement auto-clears in ~1–2 min. |
| `payments_status` never becomes `active` | The `visionworkx-connect` webhook is missing, disabled, or **not `@accounts`-scoped**. Check Workbench → Webhooks → recent deliveries are 200. |
| Webhook deliveries are **400** | Signature mismatch — the endpoint's signing secret doesn't match `STRIPE_WEBHOOK_SECRET` / `STRIPE_TEST_WEBHOOK_SECRET` in prod. Re-copy and redeploy. |
| Promote checkout fails with `No such price` | `STRIPE_PROMOTE_*_PRICE_ID` point at a different Stripe account than `STRIPE_SECRET_KEY`. Recreate the prices on the current account. |
