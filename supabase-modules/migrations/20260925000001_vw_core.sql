-- VisionWorkx modules core (A4). Lives in the DEDICATED "visionworkx-modules"
-- Supabase project — NOT the main VisionWorkx project — because submissions are
-- our clients' customers' personal data. Nothing here touches the main project.
--
-- Access model (plain English):
--   * Client logins (Supabase Auth in THIS project) belong to workspaces through
--     vw_workspace_members (role owner | staff). They can only ever see rows for
--     workspaces they belong to.
--   * Visitors on client websites never talk to the database. The VisionWorkx
--     server (service role) validates and stores their submissions.
--   * Operator-only data (events queue, webhook log, rate-limit hits) has RLS on
--     and NO policies, so only the server can touch it.

create extension if not exists pgcrypto;

-- ── helpers ─────────────────────────────────────────────────────────────────
create or replace function public.vw_touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

-- ── workspaces: one per client business ─────────────────────────────────────
create table public.vw_workspaces (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null check (char_length(name) between 1 and 120),
  slug               text not null unique check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])$'),
  domains            text[] not null default '{}',   -- hostnames allowed to embed, e.g. {example.com,www.example.com}
  brand              jsonb not null default '{}'::jsonb, -- {color, font, radius}
  logo_url           text check (logo_url is null or logo_url ~ '^https://'),
  notification_email text check (notification_email is null or char_length(notification_email) <= 254),
  time_zone          text not null default 'America/New_York',
  webhook_url        text check (webhook_url is null or webhook_url ~ '^https://'),
  webhook_secret     text not null default encode(gen_random_bytes(24), 'hex'),
  plan               text not null default 'free' check (plan in ('free','starter','growth','pro')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create trigger vw_workspaces_touch before update on public.vw_workspaces
  for each row execute function public.vw_touch_updated_at();

create table public.vw_workspace_members (
  workspace_id uuid not null references public.vw_workspaces(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         text not null check (role in ('owner','staff')),
  created_at   timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index vw_workspace_members_user_idx on public.vw_workspace_members (user_id);

-- Membership checks used by every policy. SECURITY DEFINER so the policy on
-- vw_workspace_members itself doesn't recurse.
create or replace function public.vw_is_member(ws uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.vw_workspace_members
                 where workspace_id = ws and user_id = auth.uid());
$$;
create or replace function public.vw_is_owner(ws uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.vw_workspace_members
                 where workspace_id = ws and user_id = auth.uid() and role = 'owner');
$$;
revoke all on function public.vw_is_member(uuid) from public;
revoke all on function public.vw_is_owner(uuid) from public;
grant execute on function public.vw_is_member(uuid) to authenticated;
grant execute on function public.vw_is_owner(uuid) to authenticated;

-- ── modules ─────────────────────────────────────────────────────────────────
create table public.vw_modules (
  id           uuid primary key default gen_random_uuid(),
  public_id    text not null unique default ('m_' || encode(gen_random_bytes(9), 'hex')), -- goes in the embed snippet
  workspace_id uuid not null references public.vw_workspaces(id) on delete cascade,
  type         text not null check (type in ('lead_capture','booking','quote_calculator','intake_form')),
  name         text not null check (char_length(name) between 1 and 120),
  config       jsonb not null default '{}'::jsonb,
  status       text not null default 'draft' check (status in ('draft','live','paused')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index vw_modules_workspace_idx on public.vw_modules (workspace_id);
create trigger vw_modules_touch before update on public.vw_modules
  for each row execute function public.vw_touch_updated_at();

-- ── submissions ─────────────────────────────────────────────────────────────
create table public.vw_submissions (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.vw_workspaces(id) on delete cascade,
  module_id    uuid not null references public.vw_modules(id) on delete cascade,
  data         jsonb not null,
  status       text not null default 'new' check (status in ('new','contacted','won','lost')),
  notes        text not null default '' check (char_length(notes) <= 5000),
  source_url   text check (source_url is null or char_length(source_url) <= 500),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index vw_submissions_ws_created_idx on public.vw_submissions (workspace_id, created_at desc);
create index vw_submissions_module_idx on public.vw_submissions (module_id);
create trigger vw_submissions_touch before update on public.vw_submissions
  for each row execute function public.vw_touch_updated_at();

-- ── events for the automation service (A6) ─────────────────────────────────
create table public.vw_events (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.vw_workspaces(id) on delete cascade,
  module_id     uuid references public.vw_modules(id) on delete cascade,
  submission_id uuid references public.vw_submissions(id) on delete cascade,
  type          text not null check (type in ('submission.created')),
  payload       jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  delivered_at  timestamptz
);
create index vw_events_undelivered_idx on public.vw_events (created_at) where delivered_at is null;

-- ── outgoing webhook log ────────────────────────────────────────────────────
create table public.vw_webhook_deliveries (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.vw_workspaces(id) on delete cascade,
  submission_id uuid references public.vw_submissions(id) on delete cascade,
  status_code   integer,
  error         text,
  created_at    timestamptz not null default now()
);
create index vw_webhook_deliveries_ws_idx on public.vw_webhook_deliveries (workspace_id, created_at desc);

-- ── durable rate limiting (shared across all server instances) ─────────────
create table public.vw_rate_hits (
  key    text not null,
  hit_at timestamptz not null default now()
);
create index vw_rate_hits_key_idx on public.vw_rate_hits (key, hit_at);

-- Returns true and records a hit if `key` is under `max_hits` in the last
-- `window_seconds`; false (no hit recorded) otherwise. Server-only.
create or replace function public.vw_rate_check(p_key text, max_hits integer, window_seconds integer)
returns boolean language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  delete from public.vw_rate_hits where key = p_key and hit_at < now() - make_interval(secs => window_seconds);
  select count(*) into n from public.vw_rate_hits where key = p_key;
  if n >= max_hits then return false; end if;
  insert into public.vw_rate_hits (key) values (p_key);
  return true;
end $$;
revoke all on function public.vw_rate_check(text, integer, integer) from public, anon, authenticated;
grant execute on function public.vw_rate_check(text, integer, integer) to service_role;

-- ── Row Level Security ──────────────────────────────────────────────────────
alter table public.vw_workspaces         enable row level security;
alter table public.vw_workspace_members  enable row level security;
alter table public.vw_modules            enable row level security;
alter table public.vw_submissions        enable row level security;
alter table public.vw_events             enable row level security;
alter table public.vw_webhook_deliveries enable row level security;
alter table public.vw_rate_hits          enable row level security;

-- Workspaces: members can see their workspace; only owners can edit it, and
-- only the business-facing columns (not plan, slug or webhook secret).
create policy "members read own workspace" on public.vw_workspaces
  for select to authenticated using (public.vw_is_member(id));
create policy "owners update own workspace" on public.vw_workspaces
  for update to authenticated using (public.vw_is_owner(id)) with check (public.vw_is_owner(id));
revoke insert, update, delete on public.vw_workspaces from anon, authenticated;
grant update (name, domains, brand, logo_url, notification_email, time_zone, webhook_url)
  on public.vw_workspaces to authenticated;
-- Column-level read: the webhook signing secret is never readable by client
-- logins (RLS is row-level only). Owners see it via a server route instead.
revoke select on public.vw_workspaces from anon, authenticated;
grant select (id, name, slug, domains, brand, logo_url, notification_email, time_zone, webhook_url, plan, created_at, updated_at)
  on public.vw_workspaces to authenticated;

-- Members: you can see who else is in your workspace. Membership changes are
-- server-only (invites go through the operator).
create policy "members read own workspace members" on public.vw_workspace_members
  for select to authenticated using (public.vw_is_member(workspace_id));
revoke insert, update, delete on public.vw_workspace_members from anon, authenticated;

-- Modules: members can see their workspace's modules; owners can edit name,
-- config and status. Creating/deleting modules is server-only for now.
create policy "members read own modules" on public.vw_modules
  for select to authenticated using (public.vw_is_member(workspace_id));
create policy "owners update own modules" on public.vw_modules
  for update to authenticated using (public.vw_is_owner(workspace_id)) with check (public.vw_is_owner(workspace_id));
revoke insert, update, delete on public.vw_modules from anon, authenticated;
grant update (name, config, status) on public.vw_modules to authenticated;

-- Submissions: members can see their workspace's submissions and change only
-- status and notes. New submissions arrive only through the server.
create policy "members read own submissions" on public.vw_submissions
  for select to authenticated using (public.vw_is_member(workspace_id));
create policy "members update own submissions" on public.vw_submissions
  for update to authenticated using (public.vw_is_member(workspace_id)) with check (public.vw_is_member(workspace_id));
revoke insert, update, delete on public.vw_submissions from anon, authenticated;
grant update (status, notes) on public.vw_submissions to authenticated;

-- Webhook log: owners can see delivery results for their workspace.
create policy "owners read own webhook deliveries" on public.vw_webhook_deliveries
  for select to authenticated using (public.vw_is_owner(workspace_id));
revoke insert, update, delete on public.vw_webhook_deliveries from anon, authenticated;

-- vw_events and vw_rate_hits: RLS on, no policies => server (service role) only.
revoke all on public.vw_events, public.vw_rate_hits from anon, authenticated;
