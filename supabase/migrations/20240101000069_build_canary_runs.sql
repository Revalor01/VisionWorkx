-- One row per synthetic first-build run (the golden-intake reliability
-- suite). Powers the "Build Reliability" panel in /admin: 7d/30d success
-- rate, avg build time, recent runs. Written by /api/cron/canary-build.
create table if not exists public.build_canary_runs (
  id uuid primary key default gen_random_uuid(),
  intake_key text not null,
  app_id uuid,
  status text not null,            -- pending | pass | fail
  failure_reason text,
  duration_sec integer,
  deploy_url text,
  created_at timestamptz not null default now(),
  graded_at timestamptz
);

create index if not exists build_canary_runs_created_idx
  on public.build_canary_runs (created_at desc);

comment on table public.build_canary_runs is
  'Synthetic first-build runs (golden intakes) for the reliability metric.';
