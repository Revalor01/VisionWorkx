-- A6 VisionWorkx Automation: email templates, send log, monthly usage, a
-- scheduled-jobs queue, suppressions, and a restricted role for the
-- revalor-automation service (modules DB only).
--
-- Access (plain English):
--   * Workspace members can READ their workspace's send log and usage (so the
--     dashboard can show "emails sent" and "37 of 100 this month").
--   * Owners can READ their templates; changing them goes through the
--     VisionWorkx server (owner-checked), like module edits.
--   * Scheduled jobs and suppressions are server-only (RLS on, no policies).
--   * revalor-automation connects as the vw_automation role, which can only
--     read what it needs to send, mark events done, and write logs/usage/jobs/
--     suppressions. It cannot read or change anything else. Its password is
--     set separately, never in this file.

-- ── workspace additions ─────────────────────────────────────────────────────
alter table public.vw_workspaces
  add column if not exists sending_domain text
    check (sending_domain is null or sending_domain ~ '^[a-z0-9.-]+\.[a-z]{2,}$');
-- A domain the operator has verified in Resend (SPF/DKIM). When set, mail is
-- sent from notifications@<sending_domain>; otherwise from notify.revalorllc.com.

-- ── templates ───────────────────────────────────────────────────────────────
create table public.vw_email_templates (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.vw_workspaces(id) on delete cascade,
  module_id    uuid references public.vw_modules(id) on delete cascade, -- null = workspace default
  kind         text not null check (kind in ('customer_confirmation','owner_alert','follow_up','review_request','reminder')),
  enabled      boolean not null default true,
  subject      text not null check (char_length(subject) between 1 and 200),
  body         text not null check (char_length(body) between 1 and 5000),
  delay_hours  integer not null default 0 check (delay_hours between 0 and 2160), -- scheduled kinds only
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index vw_email_templates_scope_key
  on public.vw_email_templates (workspace_id, coalesce(module_id, '00000000-0000-0000-0000-000000000000'::uuid), kind);
create trigger vw_email_templates_touch before update on public.vw_email_templates
  for each row execute function public.vw_touch_updated_at();

-- ── send log ────────────────────────────────────────────────────────────────
create table public.vw_email_log (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.vw_workspaces(id) on delete cascade,
  module_id     uuid references public.vw_modules(id) on delete set null,
  submission_id uuid references public.vw_submissions(id) on delete set null,
  job_id        uuid,
  kind          text not null,
  to_email      text not null check (char_length(to_email) <= 254),
  subject       text,
  status        text not null check (status in ('sent','failed','skipped_limit','suppressed','bounced','complained')),
  provider_id   text,
  error         text check (error is null or char_length(error) <= 500),
  created_at    timestamptz not null default now()
);
create index vw_email_log_ws_created_idx on public.vw_email_log (workspace_id, created_at desc);
create index vw_email_log_provider_idx on public.vw_email_log (provider_id) where provider_id is not null;

-- ── monthly usage (plan caps) ───────────────────────────────────────────────
create table public.vw_email_usage (
  workspace_id uuid not null references public.vw_workspaces(id) on delete cascade,
  period       text not null check (period ~ '^\d{4}-\d{2}$'),
  sent_count   integer not null default 0 check (sent_count >= 0),
  updated_at   timestamptz not null default now(),
  primary key (workspace_id, period)
);

-- ── scheduled jobs (reminders, follow-ups, review requests) ────────────────
create table public.vw_scheduled_jobs (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.vw_workspaces(id) on delete cascade,
  submission_id uuid references public.vw_submissions(id) on delete cascade,
  template_id   uuid references public.vw_email_templates(id) on delete cascade,
  kind          text not null,
  run_at        timestamptz not null,
  status        text not null default 'pending' check (status in ('pending','running','done','failed','cancelled')),
  attempts      integer not null default 0,
  payload       jsonb not null default '{}'::jsonb,
  last_error    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index vw_scheduled_jobs_due_idx on public.vw_scheduled_jobs (run_at) where status = 'pending';
create trigger vw_scheduled_jobs_touch before update on public.vw_scheduled_jobs
  for each row execute function public.vw_touch_updated_at();

-- ── suppressions (unsubscribes, bounces, complaints) ───────────────────────
create table public.vw_email_suppressions (
  workspace_id uuid not null references public.vw_workspaces(id) on delete cascade,
  email        text not null,
  reason       text not null check (reason in ('unsubscribe','bounce','complaint')),
  created_at   timestamptz not null default now(),
  primary key (workspace_id, email)
);

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.vw_email_templates    enable row level security;
alter table public.vw_email_log          enable row level security;
alter table public.vw_email_usage        enable row level security;
alter table public.vw_scheduled_jobs     enable row level security;
alter table public.vw_email_suppressions enable row level security;

create policy "owners read own templates" on public.vw_email_templates
  for select to authenticated using (public.vw_is_owner(workspace_id));
create policy "members read own email log" on public.vw_email_log
  for select to authenticated using (public.vw_is_member(workspace_id));
create policy "members read own email usage" on public.vw_email_usage
  for select to authenticated using (public.vw_is_member(workspace_id));

revoke insert, update, delete on public.vw_email_templates, public.vw_email_log, public.vw_email_usage from anon, authenticated;
revoke all on public.vw_scheduled_jobs, public.vw_email_suppressions from anon, authenticated;
-- sending_domain is set by the operator only.
revoke update (sending_domain) on public.vw_workspaces from authenticated;
grant select (sending_domain) on public.vw_workspaces to authenticated;

-- ── restricted role for revalor-automation ─────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'vw_automation') then
    create role vw_automation login noinherit;
  end if;
end $$;
grant usage on schema public to vw_automation;
grant select on public.vw_workspaces, public.vw_modules, public.vw_submissions, public.vw_email_templates to vw_automation;
grant select, update (delivered_at) on public.vw_events to vw_automation;
grant select, insert, update on public.vw_email_log, public.vw_email_usage, public.vw_scheduled_jobs to vw_automation;
grant select, insert, update on public.vw_email_suppressions to vw_automation;
-- The role bypasses nothing: give it explicit RLS policies scoped to itself.
alter role vw_automation set statement_timeout = '15s';
create policy "automation reads workspaces" on public.vw_workspaces for select to vw_automation using (true);
create policy "automation reads modules" on public.vw_modules for select to vw_automation using (true);
create policy "automation reads submissions" on public.vw_submissions for select to vw_automation using (true);
create policy "automation reads templates" on public.vw_email_templates for select to vw_automation using (true);
create policy "automation reads events" on public.vw_events for select to vw_automation using (true);
create policy "automation marks events" on public.vw_events for update to vw_automation using (true) with check (true);
create policy "automation email log" on public.vw_email_log for all to vw_automation using (true) with check (true);
create policy "automation email usage" on public.vw_email_usage for all to vw_automation using (true) with check (true);
create policy "automation jobs" on public.vw_scheduled_jobs for all to vw_automation using (true) with check (true);
create policy "automation suppressions" on public.vw_email_suppressions for all to vw_automation using (true) with check (true);

-- Atomic "count this send if under the cap" for the automation service.
create or replace function public.vw_take_email_credit(p_workspace uuid, p_period text, p_limit integer)
returns boolean language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  insert into public.vw_email_usage (workspace_id, period, sent_count)
  values (p_workspace, p_period, 0)
  on conflict (workspace_id, period) do nothing;
  update public.vw_email_usage
     set sent_count = sent_count + 1, updated_at = now()
   where workspace_id = p_workspace and period = p_period and sent_count < p_limit
  returning sent_count into n;
  return n is not null;
end $$;
revoke all on function public.vw_take_email_credit(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.vw_take_email_credit(uuid, text, integer) to vw_automation, service_role;
