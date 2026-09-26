-- Self-serve signup: a business owner signs up at modules.revalorllc.com/start,
-- confirms their email (magic link), and creates their own workspace.
--
-- Access (plain English): these columns are written by the server only.
-- Members can read their workspace's onboarding state (for the checklist).
-- One self-created workspace per account — more go through Revalor.

alter table public.vw_workspaces
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists self_serve boolean not null default false,
  add column if not exists install_requested_at timestamptz;

create unique index if not exists vw_workspaces_one_self_serve_per_user
  on public.vw_workspaces (created_by) where self_serve;

grant select (self_serve, install_requested_at, created_at) on public.vw_workspaces to authenticated;

-- New alert kinds for onboarding emails (once per workspace per month bucket).
alter table public.vw_usage_alerts drop constraint if exists vw_usage_alerts_kind_check;
alter table public.vw_usage_alerts add constraint vw_usage_alerts_kind_check check (kind in (
  'submissions_80','submissions_100','submissions_150','emails_100','storage_100',
  'welcome','install_nudge','install_request'
));
