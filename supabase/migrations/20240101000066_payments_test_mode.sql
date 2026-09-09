-- Per-app Stripe Connect test mode. When true, all Connect calls for this
-- app (onboarding, checkout, status sync) run against Stripe test data using
-- STRIPE_TEST_SECRET_KEY, so a tester can walk the whole payment flow with
-- card 4242 4242 4242 4242 and no real money moves. Toggled by an operator
-- from the admin dashboard.

alter table public.apps
  add column if not exists payments_test_mode boolean not null default false;

comment on column public.apps.payments_test_mode is
  'When true, Stripe Connect for this app uses test-mode keys (STRIPE_TEST_SECRET_KEY).';

-- nudge PostgREST to reload its schema cache
comment on table public.apps is 'Generated apps (+ preview apps when user_id is null).';
