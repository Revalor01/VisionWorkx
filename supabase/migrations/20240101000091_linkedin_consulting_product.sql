-- Adds a fourth LinkedIn product option: "revalor_consulting" — Revalor
-- Consulting is part of Revalor Business on products.revalorllc.com.
-- Same value Media Studio already uses (social_video_assets.studio_product).

alter table public.linkedin_posts
  drop constraint linkedin_posts_product_check;

alter table public.linkedin_posts
  add constraint linkedin_posts_product_check
    check (product in ('visionworkx', 'proactive', 'revalor_consulting', 'revalor'));
