-- =============================================================
-- Vision Workx — Media Studio video assets (Migration 85)
-- =============================================================
--
-- Media Studio (app/admin/social/StudioTab.tsx) creates standalone videos
-- with a user-written prompt, chosen length, and chosen outro app, rather
-- than deriving a video from a specific post's caption. These still live in
-- social_video_assets (so they show up in the same "Video asset" pickers on
-- the Content and LinkedIn tabs for free), tagged with `origin = 'studio'`
-- so any current or future posting/automation flow can find them with
-- `where origin = 'studio'`. Existing rows (manual uploads, per-post AI
-- generation) are untouched and keep defaulting to 'manual' — no backfill.

alter table public.social_video_assets
  add column origin text not null default 'manual'
    constraint social_video_assets_origin_check
    check (origin in ('manual', 'post_ai', 'studio')),
  add column studio_prompt text,
  add column studio_duration_seconds integer,
  add column studio_outro_app text;
