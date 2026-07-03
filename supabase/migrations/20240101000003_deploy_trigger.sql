-- =============================================================
-- Vision Workx — Deploy Automation Schema (Migration 3)
-- =============================================================

-- ── 1. Expand status constraint to include deployment states ──────

alter table public.apps
  drop constraint apps_status_check;

alter table public.apps
  add constraint apps_status_check
  check (status in (
    'generating',     -- Claude API call in progress
    'ready',          -- code saved, awaiting deployment
    'deploying',      -- Vercel deployment queued/building
    'deployed',       -- live at deploy_url
    'failed',         -- generation failed
    'deploy_failed'   -- Vercel deployment failed
  ));

-- ── 2. Enable pg_net for HTTP calls from Postgres triggers ────────

create extension if not exists pg_net with schema extensions;

-- ── 3. Trigger function ───────────────────────────────────────────
--
-- Fires the deploy-app Edge Function when an app status changes
-- from any state to 'ready'.
--
-- Prerequisites (run once as admin with your project values):
--   alter database postgres set app.supabase_url = 'https://xxx.supabase.co';
--   alter database postgres set app.supabase_service_key = '<service-role-key>';
--
-- The call is async — pg_net queues the HTTP request and the
-- database transaction completes immediately.

create or replace function public.trigger_deploy_on_ready()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  _url text;
  _key text;
begin
  if NEW.status = 'ready'
     and (OLD.status is null or OLD.status <> 'ready')
  then
    _url := current_setting('app.supabase_url',      true);
    _key := current_setting('app.supabase_service_key', true);

    if _url is not null and _key is not null then
      perform extensions.net.http_post(
        url     := _url || '/functions/v1/deploy-app',
        headers := jsonb_build_object(
                     'Content-Type',  'application/json',
                     'Authorization', 'Bearer ' || _key
                   ),
        body    := jsonb_build_object('appId', NEW.id::text)
      );
    end if;
  end if;
  return NEW;
end;
$$;

-- ── 4. Attach trigger ─────────────────────────────────────────────

create trigger deploy_app_on_ready
  after update of status on public.apps
  for each row
  execute function public.trigger_deploy_on_ready();
