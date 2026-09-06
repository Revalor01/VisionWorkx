-- =============================================================
-- LinkedIn posts: per-post product selection (Migration 60)
-- =============================================================
--
-- linkedin_posts (migration 52) intentionally had no brand/product column:
-- at the time, LinkedIn only ever spoke for Revalor LLC as a whole. Admin
-- now wants each post scoped to one Revalor Business product (VisionWorkx
-- or Proactive) so the generated topic/angle draws on that product's
-- actual capabilities instead of speaking generically about Revalor.
alter table public.linkedin_posts
  add column product text not null default 'visionworkx'
    constraint linkedin_posts_product_check
    check (product in ('visionworkx', 'proactive'));

create index linkedin_posts_product_idx on public.linkedin_posts(product);
