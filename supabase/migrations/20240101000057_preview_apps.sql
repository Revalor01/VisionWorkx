-- Phase 5b of "Closing the Builder Loop": reverse trial / instant preview.
--
-- A visitor can describe an app and watch it get built + deployed WITHOUT
-- an account, then claim it by signing up. A preview is just an apps row
-- with user_id null and the preview_* fields set; claiming assigns user_id
-- and clears them. An hourly-ish cron deletes previews past their TTL.

alter table public.apps alter column user_id drop not null;

alter table public.apps
  add column if not exists preview_token text,
  add column if not exists preview_email text,
  add column if not exists preview_expires_at timestamptz,
  add column if not exists claimed_at timestamptz;

create unique index if not exists apps_preview_token_idx
  on public.apps(preview_token)
  where preview_token is not null;

-- At most one un-claimed preview per email address.
create unique index if not exists apps_preview_email_unclaimed_idx
  on public.apps(preview_email)
  where preview_email is not null and claimed_at is null;

create index if not exists apps_preview_expiry_idx
  on public.apps(preview_expires_at)
  where preview_expires_at is not null and claimed_at is null;
