-- Add Proactive (leadership coaching app) as a blog product, per migration
-- 24's/36's pattern: relax the product check constraints on blog_keywords,
-- blog_posts, and blog_product_config to allow it, then seed its config row.

alter table public.blog_keywords drop constraint blog_keywords_product_check;
alter table public.blog_keywords add constraint blog_keywords_product_check
  check (product in ('visionworkx', 'chorebit', 'feelflow', 'mindbit', 'sanctum', 'proactive'));

alter table public.blog_posts drop constraint blog_posts_product_check;
alter table public.blog_posts add constraint blog_posts_product_check
  check (product in ('visionworkx', 'chorebit', 'feelflow', 'mindbit', 'sanctum', 'proactive'));

alter table public.blog_product_config drop constraint blog_product_config_product_check;
alter table public.blog_product_config add constraint blog_product_config_product_check
  check (product in ('visionworkx', 'chorebit', 'feelflow', 'mindbit', 'sanctum', 'proactive'));

-- Fully autonomous from launch, matching VisionWorkx/Sanctum's current mode.
insert into public.blog_product_config (product, autonomy_mode) values
  ('proactive', 'fully_autonomous');
