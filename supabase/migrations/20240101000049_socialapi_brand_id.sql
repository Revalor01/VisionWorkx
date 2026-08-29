-- =============================================================
-- Vision Workx — cache each brand's real SocialAPI brand id (Migration 49)
-- =============================================================
--
-- Every call to SocialAPI's POST /accounts/connect that omits `brand_id`
-- auto-creates a brand-new SocialAPI "brand" instead of attaching the
-- account to the right one — our connect flow never sent it, so every
-- platform connect for a given Revalor brand was silently creating a new
-- SocialAPI brand and burning a slot against their plan's brand cap.
-- This column caches the resolved SocialAPI brand id per local brand row
-- so subsequent connects reuse it instead of creating another one.

alter table public.social_brands add column socialapi_brand_id text;
