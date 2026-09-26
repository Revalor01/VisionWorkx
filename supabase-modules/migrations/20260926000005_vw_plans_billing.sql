-- VisionWorkx pricing: Starter $59 / Growth $129 / Pro $299, no free tier,
-- 14-day Starter trial via Stripe, plan caps enforced in code.
--
-- Access (plain English): billing columns are set by the server only (Stripe
-- webhook / operator). Members can READ their plan and billing status so the
-- dashboard can show it; nobody but the server can change them. Usage-alert
-- rows (which warning emails were already sent) are server-only.

-- ── no free tier ────────────────────────────────────────────────────────────
update public.vw_workspaces set plan = 'starter' where plan = 'free';
alter table public.vw_workspaces drop constraint if exists vw_workspaces_plan_check;
alter table public.vw_workspaces alter column plan set default 'starter';
alter table public.vw_workspaces add constraint vw_workspaces_plan_check check (plan in ('starter','growth','pro'));

-- ── billing state ───────────────────────────────────────────────────────────
alter table public.vw_workspaces
  add column if not exists billing_status text not null default 'none'
    check (billing_status in ('none','trialing','active','past_due','canceled','comped')),
  add column if not exists stripe_customer_id text unique,
  add column if not exists stripe_subscription_id text unique,
  add column if not exists trial_ends_at timestamptz,
  add column if not exists current_period_end timestamptz;
-- 'none'    = created, owner hasn't started a trial/subscription yet (forms can't go live)
-- 'comped'  = internal/demo workspace, never billed
update public.vw_workspaces set billing_status = 'comped' where slug in ('revalor-demo', 'revalor-business');

grant select (billing_status, trial_ends_at, current_period_end) on public.vw_workspaces to authenticated;
-- (no update grant: plan/billing columns are server-only)

-- ── one warning email per workspace, limit and month ───────────────────────
create table public.vw_usage_alerts (
  workspace_id uuid not null references public.vw_workspaces(id) on delete cascade,
  period       text not null check (period ~ '^\d{4}-\d{2}$'),
  kind         text not null check (kind in ('submissions_80','submissions_100','submissions_150','emails_100','storage_100')),
  created_at   timestamptz not null default now(),
  primary key (workspace_id, period, kind)
);
alter table public.vw_usage_alerts enable row level security;
revoke all on public.vw_usage_alerts from anon, authenticated;
grant select, insert on public.vw_usage_alerts to vw_automation;
create policy "automation usage alerts" on public.vw_usage_alerts for all to vw_automation using (true) with check (true);

-- ── storage used by a workspace (bytes), for the storage cap ───────────────
create or replace function public.vw_workspace_storage_bytes(p_workspace uuid)
returns bigint language sql stable security definer set search_path = public, storage as $$
  select coalesce(sum((o.metadata->>'size')::bigint), 0)
    from storage.objects o
   where o.bucket_id = 'vw-uploads'
     and split_part(o.name, '/', 1) in (select id::text from public.vw_modules where workspace_id = p_workspace);
$$;
revoke all on function public.vw_workspace_storage_bytes(uuid) from public, anon, authenticated;
grant execute on function public.vw_workspace_storage_bytes(uuid) to service_role;

-- ── fast monthly submission counts ─────────────────────────────────────────
-- (vw_submissions_ws_created_idx on (workspace_id, created_at desc) already covers it)
