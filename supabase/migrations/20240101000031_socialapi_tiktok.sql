-- =============================================================
-- Vision Workx — SocialAPI.ai TikTok connection (Migration 31)
-- =============================================================
--
-- TikTok publishing moves from the direct TikTok Developer API integration
-- (lib/social/tiktok.ts, social_tiktok_connections/social_tiktok_oauth_sessions)
-- to SocialAPI.ai, same reasoning as Migration 30's Instagram move: the
-- direct integration was never actually registered (no TIKTOK_CLIENT_KEY
-- configured anywhere) and would post SELF_ONLY-only until TikTok's own
-- Content Posting API audit passes. SocialAPI carries its own pre-approved
-- TikTok app, so this sidesteps that audit the same way it did for Meta.
--
-- The old tiktok_open_id/tiktok_username columns and the two
-- social_tiktok_* tables are left in place, unused — same treatment as
-- lib/social/meta.ts's Instagram functions after Migration 30.

alter table public.social_brands add column socialapi_tiktok_account_id text;
