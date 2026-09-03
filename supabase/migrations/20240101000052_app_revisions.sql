-- Phase 0 of "Closing the Builder Loop": the revision spine.
--
-- Until now a generated app was a one-shot: app/api/generate wrote
-- apps.generated_code once, app/api/deploy shipped it, and the only way to
-- change anything was PATCH /api/apps, which wipes generated_code and
-- regenerates from scratch. app_revisions turns that into a history — one
-- row per build of an app (the initial generation and every later edit) —
-- and carries the pre-change file snapshot so any revision can be rolled
-- back by redeploying its snapshot.

create table public.app_revisions (
  id             uuid primary key default gen_random_uuid(),
  app_id         uuid not null references public.apps(id) on delete cascade,
  -- Denormalised from apps.user_id so the RLS select policy is a plain
  -- column check, matching the apps/subscriptions policies. Set by the
  -- server from the app row at insert; never trusted from the client.
  user_id        uuid not null references public.profiles(id) on delete cascade,

  kind           text not null default 'change'
                   constraint app_revisions_kind_check
                   check (kind in ('create', 'change', 'rollback')),
  status         text not null default 'queued'
                   constraint app_revisions_status_check
                   check (status in ('queued', 'building', 'deployed', 'failed')),

  request_text   text,   -- the customer's plain-English ask (null for 'create')
  changelog      text,   -- one-line summary the edit engine returns

  -- Full FileMap (path -> contents) as it stood BEFORE this revision was
  -- applied. Rollback = redeploy this snapshot. For a 'create' row it is
  -- the empty object; for the first real edit it is the initial generation.
  file_snapshot  jsonb not null default '{}'::jsonb,
  -- string[] of the paths this revision added or modified.
  changed_files  jsonb not null default '[]'::jsonb,

  error          text,   -- failure detail when status = 'failed'
  preview_url    text,   -- Vercel preview deployment, before it is promoted

  created_at     timestamptz not null default now(),
  deployed_at    timestamptz
);

-- Settings page lists a single app's revisions newest-first.
create index app_revisions_app_id_idx on public.app_revisions(app_id, created_at desc);
-- RLS predicate + the dashboard's cross-app "recent activity".
create index app_revisions_user_id_idx on public.app_revisions(user_id, created_at desc);
-- The processor cron scans only for outstanding work.
create index app_revisions_pending_idx on public.app_revisions(status)
  where status in ('queued', 'building');

alter table public.app_revisions enable row level security;

-- Same trust boundary as subscriptions: users read their own history, and
-- only server-side code (the revision API and the processor cron, both on
-- the service-role client) ever writes.
create policy "app_revisions: users select own"
  on public.app_revisions for select
  using (auth.uid() = user_id);
