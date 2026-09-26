-- Online booking (A7-A). One calendar per workspace: confirmed bookings
-- (including their buffer time) can never overlap -- enforced by the
-- database with an exclusion constraint, so two visitors racing for the same
-- slot can't both win.
--
-- Access (plain English): members can read their own workspace's bookings;
-- nobody but the server writes them (it checks availability first).

create extension if not exists btree_gist;

create table public.vw_bookings (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references public.vw_workspaces(id) on delete cascade,
  module_id         uuid not null references public.vw_modules(id) on delete cascade,
  submission_id     uuid references public.vw_submissions(id) on delete set null,
  service_id        text not null,
  service_name      text not null,
  starts_at         timestamptz not null,
  ends_at           timestamptz not null,
  block_ends_at     timestamptz not null,           -- ends_at + buffer
  status            text not null default 'confirmed' check (status in ('confirmed','cancelled')),
  customer_tz       text,
  manage_token_hash text not null unique,           -- only a hash; the link holds the token
  reminder_job_id   uuid references public.vw_scheduled_jobs(id) on delete set null,
  cancelled_at      timestamptz,
  created_at        timestamptz not null default now(),
  check (ends_at > starts_at and block_ends_at >= ends_at),
  constraint vw_bookings_no_overlap exclude using gist (
    workspace_id with =, tstzrange(starts_at, block_ends_at) with &&
  ) where (status = 'confirmed')
);
create index vw_bookings_ws_start_idx on public.vw_bookings (workspace_id, starts_at);

alter table public.vw_bookings enable row level security;
create policy "members read own bookings" on public.vw_bookings
  for select to authenticated using (public.vw_is_member(workspace_id));
revoke insert, update, delete on public.vw_bookings from anon, authenticated;
revoke all on public.vw_bookings from anon;
