-- =============================================================
-- Vision Workx — SocialAPI.ai YouTube connection (Migration 32)
-- =============================================================
--
-- YouTube via SocialAPI: their own managed Google Cloud project, no
-- separate Google Developer setup on Revalor's end (unlike X, which
-- needs BYOK) — same "no review needed" shape as Instagram/TikTok.

alter table public.social_brands add column socialapi_youtube_account_id text;

alter table public.social_content drop constraint social_content_platform_check;
alter table public.social_content add constraint social_content_platform_check
  check (platform in ('facebook', 'instagram', 'tiktok', 'youtube'));
