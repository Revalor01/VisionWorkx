-- Phase 2 of "Closing the Builder Loop": payments in generated apps.
--
-- Categories that collect real money (invoicing, membership, and booking
-- deposits) advertise "collect payments online" in onboarding but generate
-- nothing today. This wires each app to its own Stripe Connect Standard
-- account: the business owns the account and the money, VisionWorkx creates
-- Checkout sessions on their behalf.

alter table public.apps
  -- The connected Standard account (acct_...). Null until the owner starts
  -- the Connect onboarding from App Settings.
  add column if not exists stripe_connect_account_id text,
  -- none    — not started
  -- pending — account created, Stripe still needs details / verification
  -- active  — charges_enabled; the app can take payments
  add column if not exists payments_status text not null default 'none'
    constraint apps_payments_status_check
      check (payments_status in ('none', 'pending', 'active')),
  -- Shared secret the generated app sends when it calls the platform's
  -- /api/apps/<id>/checkout endpoint. Generated when Connect onboarding
  -- starts, injected into the deployed app as APP_CHECKOUT_SECRET.
  add column if not exists checkout_secret text;

create index if not exists apps_stripe_connect_account_id_idx
  on public.apps(stripe_connect_account_id)
  where stripe_connect_account_id is not null;
