-- =============================================================
-- Vision Workx — Automation Workflows (Migration 10)
-- =============================================================
--
-- Customer-facing configuration: lets a VisionWorkx business owner turn
-- a specific trigger -> action pair on/off for their own app, instead
-- of the action engine's mapping being hardcoded and always-on for
-- every app. One row per (app, trigger_type, action_type) combination.
--
-- This is deliberately a flat enable/disable table, not a general
-- workflow builder — there's exactly one configurable automation right
-- now (booking.created -> send_confirmation_email). The shape scales to
-- more trigger/action pairs later without a redesign.

create table public.automation_workflows (
  id             uuid primary key default gen_random_uuid(),
  app_id         uuid not null references public.apps(id) on delete cascade,
  trigger_type   text not null,
  action_type    text not null,
  enabled        boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (app_id, trigger_type, action_type)
);

create index automation_workflows_app_id_idx on public.automation_workflows(app_id);

alter table public.automation_workflows enable row level security;

-- App owners (regular authenticated customers) can manage only their
-- own app's workflow rows.
create policy "automation_workflows: owners select own"
  on public.automation_workflows for select
  using (exists (
    select 1 from public.apps a where a.id = app_id and a.user_id = auth.uid()
  ));

create policy "automation_workflows: owners insert own"
  on public.automation_workflows for insert
  with check (exists (
    select 1 from public.apps a where a.id = app_id and a.user_id = auth.uid()
  ));

create policy "automation_workflows: owners update own"
  on public.automation_workflows for update
  using (exists (
    select 1 from public.apps a where a.id = app_id and a.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.apps a where a.id = app_id and a.user_id = auth.uid()
  ));

-- The poller needs to read enabled status before firing an action.
grant select on public.automation_workflows to automations_reader;

create policy "automations_reader: select all workflows"
  on public.automation_workflows for select
  to automations_reader
  using (true);
