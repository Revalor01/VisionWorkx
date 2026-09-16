-- Sunsets VisionWorkx Promote (migration 16) — the standalone AI ad-creative
-- + campaign management product. Never launched to customers (marketed as
-- "Coming Soon" only): confirmed 2026-09-16, all 6 promote_* tables at zero
-- rows and the promote-assets storage bucket at zero files. Safe, complete
-- removal — no customer data exists to migrate or preserve.

drop table if exists public.promote_campaign_creatives cascade;
drop table if exists public.promote_analytics cascade;
drop table if exists public.promote_creatives cascade;
drop table if exists public.promote_campaigns cascade;
drop table if exists public.promote_subscriptions cascade;
drop table if exists public.promote_businesses cascade;

drop policy if exists "promote-assets: users upload own" on storage.objects;
drop policy if exists "promote-assets: users update own" on storage.objects;
drop policy if exists "promote-assets: users delete own" on storage.objects;
drop policy if exists "promote-assets: public read" on storage.objects;

-- storage.buckets is protected against direct SQL deletion
-- ("Direct deletion from storage tables is not allowed. Use the Storage
-- API instead.") — the promote-assets bucket itself was removed via a
-- DELETE /storage/v1/bucket/promote-assets Storage API call alongside
-- this migration, not by SQL.
