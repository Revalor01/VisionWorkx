-- Product Stability screen (app/admin/stability): a history of
-- Claude-generated root-cause analyses run on demand from /admin when the
-- product reads red or amber. Diagnosis only — nothing here executes a
-- fix; the operator reads issues/recommendations and decides what to act
-- on. Written only by the service role from app/api/admin/stability-analysis.
create table if not exists public.stability_analyses (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  -- Snapshot of the traffic-light state at the moment this ran, so a past
  -- analysis can be read in the context it was made in even after the
  -- live number has moved on.
  band text not null check (band in ('green', 'amber', 'red')),
  completion_rate_pct numeric,
  -- The exact stats payload sent to Claude (canary streak/rate, build
  -- outcome counts, top failure reasons) — lets a human (or a future
  -- analysis) see exactly what the model was reasoning from.
  input_summary jsonb not null,
  issues jsonb not null default '[]'::jsonb,
  recommendations jsonb not null default '[]'::jsonb,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cost_usd numeric
);

create index if not exists stability_analyses_created_at_idx
  on public.stability_analyses (created_at desc);

alter table public.stability_analyses enable row level security;
-- No policies: this table is never read/written via the anon/authenticated
-- PostgREST role, only via the service-role client from
-- app/api/admin/stability-analysis (which does its own admin-email check),
-- same as every other admin-only table in this project.
