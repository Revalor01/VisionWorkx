-- =============================================================
-- Vision Workx — Add Sanctum to Email Marketing (Migration 42)
-- =============================================================
--
-- Sanctum (Revalor Wellness) is a live product but was left out of the
-- marketing_campaigns / marketing_unsubscribes product check constraints
-- when migration 29 shipped. Widen both to admit it, matching
-- lib/marketing/products.ts's registry.

alter table public.marketing_campaigns
  drop constraint marketing_campaigns_product_check;
alter table public.marketing_campaigns
  add constraint marketing_campaigns_product_check
  check (product in ('visionworkx', 'chorebit', 'feelflow', 'mindbit', 'sanctum'));

alter table public.marketing_unsubscribes
  drop constraint marketing_unsubscribes_product_check;
alter table public.marketing_unsubscribes
  add constraint marketing_unsubscribes_product_check
  check (product in ('visionworkx', 'chorebit', 'feelflow', 'mindbit', 'sanctum'));
