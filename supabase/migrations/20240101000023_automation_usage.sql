-- =============================================================
-- Vision Workx — automation usage limits per plan tier (Migration 23)
-- =============================================================
--
-- Automations (booking confirmation / lead acknowledgment emails) were
-- previously unmetered — any customer on any plan could send an
-- unlimited number, all billed to Resend/Vercel as a flat Revalor
-- operating cost with no cap. This table lets the poller enforce a
-- per-plan monthly cap before calling Resend.
--
-- Counted per user (not per app), matching how app-count limits already
-- work account-wide (see PLAN_APP_LIMITS in app/dashboard/DashboardClient.tsx)
-- rather than introducing a second, inconsistent limiting axis.

create table public.automation_usage (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  period     text not null, -- 'YYYY-MM', UTC
  sent_count int not null default 0,
  updated_at timestamptz not null default now(),
  unique (user_id, period)
);

alter table public.automation_usage enable row level security;

-- Owners can read their own usage (e.g. to show "12/100 sent this month"
-- on the Settings page) — no write access; only the poller increments this.
create policy "automation_usage: owner select own"
  on public.automation_usage for select
  to authenticated
  using (user_id = auth.uid());

-- Same reader role used for automation_events/apps (see migrations 8-9),
-- extended here to check the plan limit and record each send. Needs
-- profiles.plan too, granted below.
grant select, insert, update on public.automation_usage to automations_reader;

create policy "automations_reader: select all usage"
  on public.automation_usage for select
  to automations_reader
  using (true);

create policy "automations_reader: insert usage"
  on public.automation_usage for insert
  to automations_reader
  with check (true);

create policy "automations_reader: update usage"
  on public.automation_usage for update
  to automations_reader
  using (true)
  with check (true);

grant select on public.profiles to automations_reader;

create policy "automations_reader: select all profiles"
  on public.profiles for select
  to automations_reader
  using (true);
