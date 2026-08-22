-- =============================================================
-- Vision Workx — SocialAPI.ai inbox/DM webhook support (Migration 33)
-- =============================================================
--
-- The old direct-Meta webhook (app/api/webhooks/social-meta) never
-- actually worked: Facebook was never subscribed via /subscribed_apps,
-- and Instagram DMs stopped being deliverable to it at all once
-- Instagram moved to SocialAPI's own Meta app (Migration 30) — Meta
-- routes messaging events to whichever app owns the connection.
--
-- SocialAPI has its own unified inbox + webhook system (dm.received,
-- comment.received) covering every platform connected through it. This
-- adds a Facebook connection *for inbox purposes only* — separate from
-- fb_page_id/social_connections, which stay on the direct integration
-- for posting (that one works fine, no reason to touch it).

alter table public.social_brands add column socialapi_facebook_account_id text;

alter table public.social_inbox_items drop constraint social_inbox_items_platform_check;
alter table public.social_inbox_items add constraint social_inbox_items_platform_check
  check (platform in ('facebook', 'instagram', 'tiktok', 'youtube'));
