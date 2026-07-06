-- =============================================================
-- Vision Workx — Automation Events Outbox (Migration 7)
-- =============================================================
--
-- Foundation for Revalor Automations: a single, platform-owned outbox
-- table that any tenant schema (app_<id>) can write into via a shared
-- SECURITY DEFINER trigger function, regardless of that schema's own
-- search_path or grants. Nothing in this migration attaches the
-- trigger to any tenant table yet — that happens per-app in the
-- deploy pipeline (a later change to app/api/deploy/route.ts), so this
-- piece is safe to ship on its own.
--
-- This table is never exposed to anon/authenticated (the roles a
-- generated app's Supabase client uses) — RLS is enabled with no
-- policies, so it default-denies everyone except service_role and,
-- later, a dedicated automations reader role provisioned separately.

-- ── 1. Outbox table ─────────────────────────────────────────────

create table public.automation_events (
  id             uuid primary key default gen_random_uuid(),
  app_id         uuid not null references public.apps(id) on delete cascade,
  schema_name    text not null,
  table_name     text not null,
  operation      text not null
                   constraint automation_events_operation_check
                   check (operation in ('INSERT', 'UPDATE', 'DELETE')),
  row_data       jsonb not null,
  old_row_data   jsonb,
  created_at     timestamptz not null default now(),
  delivered_at   timestamptz
);

create index automation_events_app_id_idx on public.automation_events(app_id);

-- Fast lookup for the delivery worker: undelivered events, oldest first.
create index automation_events_undelivered_idx
  on public.automation_events(created_at)
  where delivered_at is null;

alter table public.automation_events enable row level security;
-- No policies — default-deny for anon/authenticated. service_role bypasses
-- RLS entirely; a scoped automations_reader role gets explicit grants and
-- a policy in a follow-up migration once that role exists.

-- ── 2. Shared trigger function ───────────────────────────────────
--
-- Attach this to any table in any tenant schema:
--
--   create trigger emit_automation_event
--     after insert or update or delete on "app_xxxxxxxx".some_table
--     for each row execute function public.emit_automation_event('<app-uuid>');
--
-- The app's uuid is passed as a trigger argument (TG_ARGV[0]) rather
-- than derived from the schema name, so this function has no
-- dependency on the "app_<first-8-chars>" naming convention and keeps
-- working even if that convention ever changes.

create or replace function public.emit_automation_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  _app_id uuid;
begin
  _app_id := TG_ARGV[0]::uuid;

  insert into public.automation_events (
    app_id, schema_name, table_name, operation, row_data, old_row_data
  )
  values (
    _app_id,
    TG_TABLE_SCHEMA,
    TG_TABLE_NAME,
    TG_OP,
    case when TG_OP = 'DELETE' then to_jsonb(OLD) else to_jsonb(NEW) end,
    case when TG_OP = 'UPDATE' then to_jsonb(OLD) else null end
  );

  return case when TG_OP = 'DELETE' then OLD else NEW end;
end;
$$;
