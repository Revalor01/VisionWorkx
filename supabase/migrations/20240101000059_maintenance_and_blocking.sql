-- Cross-app "under maintenance" / per-user block support, controlled from
-- Revalor Admin via the Supabase Management API (see revalor-admin's
-- lib/maintenance.ts) — this app's own middleware just reads these. Already
-- applied to this project (etiddiiqmcipmqsktjvf) via Revalor Admin's setup
-- action; this file documents it for the repo's own migration history.
-- Idempotent so it's still safe to run again.

create table if not exists system_settings (
  id int primary key default 1,
  maintenance_mode boolean not null default false,
  maintenance_message text not null default 'We are performing scheduled maintenance and will be back shortly.',
  updated_at timestamptz not null default now(),
  constraint system_settings_singleton check (id = 1)
);

insert into system_settings (id) values (1) on conflict (id) do nothing;

alter table system_settings enable row level security;

-- Readable by anyone, including signed-out visitors — middleware checks
-- this on every request before a user has a session. Only ever written to
-- via Revalor Admin's service-role Management API calls, so a public
-- SELECT policy is all that's needed here.
drop policy if exists "anyone can read system settings" on system_settings;
create policy "anyone can read system settings" on system_settings for select using (true);

alter table profiles add column if not exists blocked boolean not null default false;
alter table profiles add column if not exists block_reason text;
