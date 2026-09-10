-- Attribute build AI cost to a specific app. Set for the build-related
-- sources (app_generate, app_generate_plan, app_deploy_repair, app_edit);
-- null for everything else (social, blog, marketing, try_recommend).
-- Powers the /admin "Cost per Build" panel + the per-app Build cost column.
alter table public.ai_usage_log
  add column if not exists app_id uuid;

create index if not exists ai_usage_log_app_id_idx
  on public.ai_usage_log (app_id)
  where app_id is not null;

comment on column public.ai_usage_log.app_id is
  'Set for build-related AI calls so cost can be attributed to one app.';
