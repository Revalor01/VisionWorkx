-- Phase 3 of "Closing the Builder Loop": Insights.
--
-- Every generated app exposes a `vw_metrics_daily` view in its own tenant
-- schema — shape (day date, metric_key text, value numeric), one row per
-- day per metric. The nightly cron snapshots each app's view into this
-- platform-side table so the Insights dashboard reads fast history without
-- hitting tenant schemas on every page load.

create table public.app_metrics (
  id          uuid primary key default gen_random_uuid(),
  app_id      uuid not null references public.apps(id) on delete cascade,
  -- Denormalised from apps.user_id for a plain-column RLS policy, same as
  -- app_revisions. Set server-side from the app row.
  user_id     uuid not null references public.profiles(id) on delete cascade,
  day         date not null,
  metric_key  text not null,
  value       numeric not null default 0,
  captured_at timestamptz not null default now(),
  unique (app_id, day, metric_key)
);

create index app_metrics_app_day_idx on public.app_metrics(app_id, day desc);
create index app_metrics_user_idx on public.app_metrics(user_id);

alter table public.app_metrics enable row level security;

-- Users read their own apps' metrics; only the rollup cron (service role)
-- writes.
create policy "app_metrics: users select own"
  on public.app_metrics for select
  using (auth.uid() = user_id);
