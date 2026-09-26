-- Stripe Connect for module workspaces, separate from the platform
-- subscription billing added in 20260926000005. This lets a workspace
-- collect payments FROM ITS OWN CUSTOMERS (deposits, invoices) through its
-- own connected Stripe account -- same Standard/direct-charge/application-fee
-- model already proven for generated apps (lib/apps/payments.ts), just
-- rescoped from `apps` to `vw_workspaces`.
--
-- Access (plain English): Connect fields are set by the server only (Stripe
-- webhook / onboarding route). Members can read their own workspace's
-- connect status so the dashboard can show it; nobody but the server can
-- change it. Submission payment fields follow the same pattern: members can
-- read their own submissions' payment state (already true via the existing
-- submissions policy), but only the server can write it.

alter table public.vw_workspaces
  add column if not exists stripe_connect_account_id text unique,
  add column if not exists connect_payments_status text not null default 'none'
    check (connect_payments_status in ('none','pending','active')),
  add column if not exists connect_payments_test_mode boolean not null default false;

grant select (stripe_connect_account_id, connect_payments_status) on public.vw_workspaces to authenticated;
-- (no update grant: these columns are server-only, same as the billing columns)

alter table public.vw_submissions
  add column if not exists payment_status text not null default 'none'
    check (payment_status in ('none','pending','paid','failed')),
  add column if not exists payment_amount_cents integer check (payment_amount_cents is null or payment_amount_cents > 0),
  add column if not exists stripe_checkout_session_id text;

-- vw_submissions was never column-restricted for select (unlike
-- vw_workspaces), so members already read these new columns via the core
-- migration's "members read own submissions" row policy. The existing
-- `grant update (status, notes)` is untouched -- payment fields stay
-- server-only, same as billing_status on vw_workspaces.
