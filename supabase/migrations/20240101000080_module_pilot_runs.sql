-- Persists every run of scripts/pilot-crm-module.mjs (and future module
-- pilots — see pilot_name) so /admin/module-pilot can show real averages
-- instead of a single sample. Previously only written to a local, gitignored
-- JSONL file (scripts/pilot-crm-module-history.jsonl) — that's fine for the
-- script's own console output, but a deployed admin dashboard can't read a
-- file on whichever machine happened to run the script, so this table is
-- the source of truth going forward. The three JSONL entries preceding this
-- migration were backfilled by hand into this table after it was created.
create table if not exists public.module_pilot_runs (
  id                     uuid primary key default gen_random_uuid(),
  pilot_name             text not null default 'booking_crm_module',
  app_id                 uuid,
  outcome                text not null check (outcome in ('pass', 'core_failed', 'module_failed', 'regression_failed', 'blocked', 'error')),
  outcome_detail         text,
  generate_started_at    timestamptz,
  generate_ended_at      timestamptz,
  generate_duration_sec  numeric,
  generate_status        text,
  edit_started_at        timestamptz,
  edit_ended_at          timestamptz,
  edit_duration_sec      numeric,
  edit_status            text,
  regression_started_at  timestamptz,
  regression_ended_at    timestamptz,
  regression_duration_sec numeric,
  regression_status      text,
  costs                  jsonb not null default '[]'::jsonb,
  total_cost_usd         numeric not null default 0,
  total_duration_ms      integer,
  run_at                 timestamptz not null default now(),
  created_at             timestamptz not null default now()
);

-- VisionWorkx's admin model is a single hardcoded owner email
-- (lib/adminSso.ts's ADMIN_EMAIL), not a profiles.is_admin column — there's
-- no per-row policy to write here that means anything. RLS on with zero
-- policies (default deny for anon/authenticated): only the service-role
-- key (the pilot script, and the admin page's own createServiceClient()
-- call, same pattern as dev_activity_log) can read or write this table.
alter table public.module_pilot_runs enable row level security;
