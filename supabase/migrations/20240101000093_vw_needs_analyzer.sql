-- Revalor Needs Analyzer, online copy (/admin/needs-analyzer). Internal Revalor
-- sales data, operator-only. The offline app (revalor-needs-analyzer) keeps
-- working on its own; its assessments sync here via /api/needs-analyzer/sync.
--
-- RLS is on with no policies: no browser (anon or signed-in) can read or write
-- these tables. Only VisionWorkx server code using the service role can, after
-- it has checked the operator (or the sync secret, or a proposal share token).

create table if not exists vw_na_assessments (
  id uuid primary key default gen_random_uuid(),
  local_id text unique,                 -- id from the offline app, used by sync
  status text not null default 'Draft',
  answers jsonb not null default '{}'::jsonb,
  overrides jsonb not null default '{}'::jsonb,
  share_token text unique,
  share_enabled boolean not null default false,
  is_test boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists vw_na_assessments_updated_idx on vw_na_assessments (updated_at desc) where deleted_at is null;
alter table vw_na_assessments enable row level security;

-- One row each for the catalog and the ecosystem. No row = the app uses its
-- built-in defaults (lib/needsAnalyzer/*.default.json).
create table if not exists vw_na_settings (
  key text primary key check (key in ('catalog', 'ecosystem')),
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table vw_na_settings enable row level security;
