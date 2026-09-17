-- =============================================================
-- Vision Workx — Media Studio product field (Migration 86)
-- =============================================================
--
-- social_video_assets.brand_id is the account/voice identity a Studio
-- video was generated under (e.g. "Revalor LLC") — not necessarily which
-- specific product it's actually about. Mirrors linkedin_posts.product
-- (migration 61/83): a video generated under the Revalor LLC brand can
-- still be promoting VisionWorkx specifically. Studio-only field, same as
-- the other studio_* columns from migration 85.

alter table public.social_video_assets
  add column studio_product text
    constraint social_video_assets_studio_product_check
    check (studio_product in (
      'visionworkx', 'proactive', 'sanctum', 'chorebit', 'feelflow', 'mindbit',
      'christian_friends_hub', 'revalor'
    ));
