-- =============================================================
-- Vision Workx — SocialAPI.ai Instagram connection (Migration 30)
-- =============================================================
--
-- Instagram publishing moves from the direct Meta Graph integration
-- (lib/social/meta.ts, still used for Facebook) to SocialAPI.ai, which
-- carries its own pre-approved Meta app so brands connect via a simple
-- OAuth redirect instead of going through Meta App Review themselves.
-- One column is enough: SocialAPI.ai's connected-account id is the only
-- thing the publish call needs (no page token to store, unlike Meta).

alter table social_brands add column socialapi_account_id text;
