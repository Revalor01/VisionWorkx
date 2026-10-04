-- Opt-in automatic images for Social posts. When true, the
-- /api/cron/social-images job generates the post's image before it publishes
-- (and schedules an Instagram draft once it has one). Default false, so
-- existing posts and autonomous drafts are untouched. Purely additive; RLS
-- unchanged (service role only). social_content is also written by
-- revalor-admin's Studios; a defaulted column doesn't affect its inserts.
alter table public.social_content
  add column if not exists auto_image boolean not null default false;
