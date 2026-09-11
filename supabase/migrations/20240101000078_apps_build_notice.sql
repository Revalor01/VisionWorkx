-- Customer-facing build notice. When a build hits a hard failure the pipeline
-- writes an auto-generated "we've run into an issue and are on it" message
-- here; the /generate page and dashboard show it in an update panel. The
-- operator can overwrite it with a progress update from /admin. Cleared when
-- the app deploys. (docs/stabilization-plan.md — client-exposure work)

alter table public.apps
  add column if not exists build_notice text,
  add column if not exists build_notice_at timestamptz;

comment on column public.apps.build_notice is
  'Customer-facing status message shown while a build is stuck/failed. Auto-set on hard failure, operator-editable, cleared on deploy.';
