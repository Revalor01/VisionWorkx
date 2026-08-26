-- System-wide security/enhancement scan, triggered by a button on
-- revalor-admin. A Vercel serverless function clones each Revalor repo
-- fresh from GitHub, runs npm audit + a secret-pattern scan + a few
-- heuristic checks, and writes results here. Read by revalor-admin's
-- /system-scan page.
create table public.system_scan_runs (
  id           uuid primary key default gen_random_uuid(),
  status       text not null default 'running', -- running | completed | failed
  triggered_by text,
  repos        text[] not null default '{}',
  error        text,
  started_at   timestamptz not null default now(),
  completed_at timestamptz
);

create table public.system_scan_findings (
  id         uuid primary key default gen_random_uuid(),
  run_id     uuid not null references public.system_scan_runs(id) on delete cascade,
  repo       text not null,
  category   text not null, -- security | enhancement
  severity   text not null, -- critical | high | medium | low | info
  title      text not null,
  detail     text,
  file_path  text,
  created_at timestamptz not null default now()
);

create index system_scan_findings_run_id_idx on public.system_scan_findings(run_id);
create index system_scan_runs_started_at_idx on public.system_scan_runs(started_at desc);

-- RLS enabled with no policies: all access goes through the service-role
-- client, same pattern as dev_activity_log and claude_code_usage.
alter table public.system_scan_runs enable row level security;
alter table public.system_scan_findings enable row level security;
