-- =============================================================
-- Vision Workx — Scheduled & Recurring Email Campaigns (Migration 43)
-- =============================================================
--
-- Lets a marketing_campaigns row be scheduled for a future one-off send
-- (run_at) instead of only "generate then send now" (migration 29's
-- original shape). Recurring digests are a separate small table of
-- schedules; each firing inserts a fresh marketing_campaigns row linked
-- back via recurring_schedule_id, so a recurring digest's past sends show
-- up in campaign history the same way one-off sends already do, rather
-- than one row mutating in place and losing its own history.
--
-- Written to be safely re-runnable (IF NOT EXISTS / exception-guarded
-- constraints), same as migration 45 — a later migration (46) referencing
-- objects this one creates already applied while this one hadn't,
-- meaning some earlier partial/out-of-order run needs to be tolerated.

alter table public.marketing_campaigns
  add column if not exists goal text,
  add column if not exists voice_notes text,
  add column if not exists autonomy text not null default 'manual',
  add column if not exists run_at timestamptz,
  add column if not exists canceled_at timestamptz,
  add column if not exists recurring_schedule_id uuid;

do $$ begin
  alter table public.marketing_campaigns
    add constraint marketing_campaigns_autonomy_check check (autonomy in ('manual', 'auto'));
exception when duplicate_object then null;
end $$;

alter table public.marketing_campaigns
  drop constraint if exists marketing_campaigns_status_check;
alter table public.marketing_campaigns
  add constraint marketing_campaigns_status_check
  check (status in ('draft', 'scheduled', 'generated', 'pending_review', 'sending', 'sent', 'failed', 'canceled'));

create index if not exists marketing_campaigns_run_at_idx on public.marketing_campaigns(run_at) where status = 'scheduled';

create table if not exists public.marketing_recurring_schedules (
  id                 uuid primary key default gen_random_uuid(),
  product            text not null,
  goal               text not null,
  voice_notes        text,
  recurrence         text not null,
  -- 0 (Sunday) .. 6 (Saturday); required and only meaningful when recurrence = 'weekly'.
  day_of_week        integer,
  -- 1..31; required and only meaningful when recurrence = 'monthly'. A month
  -- shorter than this day fires on that month's last day instead.
  day_of_month       integer,
  hour_utc           integer not null,
  autonomy           text not null default 'manual',
  active             boolean not null default true,
  next_run_at        timestamptz not null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

do $$ begin
  alter table public.marketing_recurring_schedules
    add constraint marketing_recurring_schedules_product_check
    check (product in ('visionworkx', 'chorebit', 'feelflow', 'mindbit', 'sanctum'));
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.marketing_recurring_schedules
    add constraint marketing_recurring_schedules_recurrence_check
    check (recurrence in ('weekly', 'monthly'));
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.marketing_recurring_schedules
    add constraint marketing_recurring_schedules_dow_check
    check (day_of_week is null or day_of_week between 0 and 6);
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.marketing_recurring_schedules
    add constraint marketing_recurring_schedules_dom_check
    check (day_of_month is null or day_of_month between 1 and 31);
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.marketing_recurring_schedules
    add constraint marketing_recurring_schedules_hour_check
    check (hour_utc between 0 and 23);
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.marketing_recurring_schedules
    add constraint marketing_recurring_schedules_autonomy_check
    check (autonomy in ('manual', 'auto'));
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.marketing_campaigns
    add constraint marketing_campaigns_recurring_schedule_id_fkey
    foreign key (recurring_schedule_id) references public.marketing_recurring_schedules(id) on delete set null;
exception when duplicate_object then null;
end $$;

create index if not exists marketing_recurring_schedules_next_run_idx
  on public.marketing_recurring_schedules(next_run_at) where active = true;

alter table public.marketing_recurring_schedules enable row level security;
-- No policies — default-deny, same as every other marketing table. Only
-- the service-role client (admin API routes + the cron route) touches this.
