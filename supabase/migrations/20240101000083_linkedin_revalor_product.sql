-- Adds a third LinkedIn product option: "revalor" — a company-wide post
-- (not scoped to one specific product), for when the angle is Revalor
-- itself rather than VisionWorkx or Proactive specifically. Requested
-- 2026-09-17 alongside folding Proactive into Revalor LLC's main social
-- account while VisionWorkx's own promotion is paused.

alter table public.linkedin_posts
  drop constraint linkedin_posts_product_check;

alter table public.linkedin_posts
  add constraint linkedin_posts_product_check
    check (product in ('visionworkx', 'proactive', 'revalor'));
