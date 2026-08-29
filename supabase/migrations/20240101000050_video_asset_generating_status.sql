-- =============================================================
-- Vision Workx — add 'generating'/'failed' video asset statuses (Migration 50)
-- =============================================================
--
-- AI-generated video (Kling v2.6, via app/api/social/content/[id]/generate-video)
-- routinely takes 2-4 minutes — longer than a client connection can be held
-- open for on Vercel, so the route was rewritten to respond immediately with
-- a placeholder row and finish the generation in the background (`after()`),
-- updating this row's status when it completes. These two statuses are
-- system-managed (set only by that route), not user-selectable like the
-- existing raw/in_editing/ready/posted states.

alter table public.social_video_assets drop constraint social_video_assets_status_check;
alter table public.social_video_assets add constraint social_video_assets_status_check
  check (status in ('raw', 'in_editing', 'ready', 'posted', 'generating', 'failed'));
