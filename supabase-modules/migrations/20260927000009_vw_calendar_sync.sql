-- Google Calendar sync for booking modules (A7-B). One connected calendar
-- per workspace (the owner's primary): its busy times block booking slots,
-- and confirmed bookings are written to it as events.
--
-- Access (plain English): only the server can read or write calendar
-- connections -- not even the workspace's own members -- because each row
-- holds the (encrypted) Google refresh token. The Settings page shows
-- connection status through the server. The new booking column is written by
-- the server like the rest of vw_bookings; members can already read it via
-- the existing "members read own bookings" policy.

create table public.vw_calendar_connections (
  workspace_id      uuid primary key references public.vw_workspaces(id) on delete cascade,
  provider          text not null default 'google' check (provider in ('google')),
  account_email     text check (account_email is null or char_length(account_email) <= 254),
  calendar_id       text not null default 'primary',
  refresh_token_enc text,            -- AES-256-GCM (CALENDAR_TOKEN_KEY); null once disconnected
  status            text not null default 'active' check (status in ('active','error','disconnected')),
  last_error        text,
  connected_by      uuid references auth.users(id) on delete set null,
  connected_at      timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table public.vw_calendar_connections enable row level security;
-- No policies on purpose: with RLS on and no policy, members and visitors can't
-- read or change anything here; only the server (service role) can.
revoke all on public.vw_calendar_connections from anon, authenticated;

alter table public.vw_bookings add column if not exists gcal_event_id text;
