-- Phase 4 of "Closing the Builder Loop": automations that match the pitch.
--
-- "VisionWorkx Automation" was two always-email triggers. This adds:
--  - a per-workflow delivery channel (email or SMS)
--  - a separate SMS meter alongside the existing email one
--  - a dedupe log for time-based automations (24h reminders, stale-quote
--    nudges) run by the new /api/cron/app-automations scanner

alter table public.automation_workflows
  add column if not exists channel text not null default 'email'
    constraint automation_workflows_channel_check
      check (channel in ('email', 'sms'));

alter table public.automation_usage
  add column if not exists sms_sent_count int not null default 0;

-- One row per (app, automation, subject row) that a time-based scan has
-- already actioned, so an hourly cron never double-sends.
create table if not exists public.automation_time_log (
  id           uuid primary key default gen_random_uuid(),
  app_id       uuid not null references public.apps(id) on delete cascade,
  trigger_type text not null,
  ref_id       text not null,   -- the tenant row's id, as text
  sent_at      timestamptz not null default now(),
  unique (app_id, trigger_type, ref_id)
);

create index if not exists automation_time_log_app_idx
  on public.automation_time_log(app_id, trigger_type);

alter table public.automation_time_log enable row level security;
-- Service-role only (the scanner). Owners don't need to read this.
