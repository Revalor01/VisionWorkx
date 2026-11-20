-- =============================================================
-- LinkedIn automation controls (Migration 111)
-- =============================================================
--
-- One settings row for the Zapier LinkedIn automation, edited on
-- /admin/social -> LinkedIn:
--   enabled  - false pauses sending: the RSS feed serves no items, so neither
--              Zap (Revalor LLC page, personal profile) posts anything.
--              Scheduled posts stay approved and wait.
--   cadence  - which slots "Fill open slots" and the Schedule picker use:
--              weekly (Tue 9am), twice_weekly (Tue + Thu 9am),
--              biweekly (every other Tue 9am).
--   ends_at  - optional end of the run; after it the feed behaves as paused.
--
-- Singleton (id = 1). New table only, nothing else touched. RLS on with no
-- policies (service-role only), like linkedin_posts. Safe to re-run.
-- The app falls back to defaults (on, weekly, no end) if this table is
-- missing, so merge order can't break the feed.

create table if not exists public.linkedin_automation (
  id smallint primary key default 1 check (id = 1),
  enabled boolean not null default true,
  cadence text not null default 'weekly' check (cadence in ('weekly', 'twice_weekly', 'biweekly')),
  ends_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.linkedin_automation enable row level security;

insert into public.linkedin_automation (id) values (1) on conflict (id) do nothing;

-- Rollback (destructive, needs explicit OK under CLAUDE.md):
--   drop table if exists public.linkedin_automation;
