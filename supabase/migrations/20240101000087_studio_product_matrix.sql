-- =============================================================
-- Vision Workx — correct Media Studio product list (Migration 87)
-- =============================================================
--
-- Swaps the placeholder 'christian_friends_hub' value for
-- 'revalor_consulting' to match the real brand/product matrix:
--   Revalor Business (brand)  -> visionworkx, proactive, revalor_consulting
--   Revalor Kids (brand)      -> chorebit, feelflow, mindbit
--   Revalor Wellness (brand)  -> sanctum
-- plus 'revalor' as a company-wide/no-specific-product option (same
-- pattern as linkedin_posts.product, migration 83).

alter table public.social_video_assets
  drop constraint social_video_assets_studio_product_check;

alter table public.social_video_assets
  add constraint social_video_assets_studio_product_check
    check (studio_product in (
      'visionworkx', 'proactive', 'revalor_consulting', 'chorebit', 'feelflow', 'mindbit',
      'sanctum', 'revalor'
    ));
