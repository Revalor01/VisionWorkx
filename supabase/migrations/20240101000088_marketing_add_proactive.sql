-- =============================================================
-- Vision Workx — Add Proactive to Marketing (Migration 88)
-- =============================================================
--
-- Proactive is a live product (see revalor-admin/lib/lines.ts) but the
-- marketing tables' product check constraints stopped at Sanctum. Widen
-- them to admit it, matching lib/marketing/products.ts's registry — the
-- same shape as migration 42 (Sanctum) and migration 60 (blog/Proactive).
--
-- Covers every table the marketing/mobile/lifecycle features write a
-- product to: marketing_campaigns (email + push + sms rows),
-- marketing_unsubscribes, marketing_recurring_schedules, lifecycle_fires.

alter table public.marketing_campaigns
  drop constraint if exists marketing_campaigns_product_check;
alter table public.marketing_campaigns
  add constraint marketing_campaigns_product_check
  check (product in ('visionworkx', 'chorebit', 'feelflow', 'mindbit', 'sanctum', 'proactive'));

alter table public.marketing_unsubscribes
  drop constraint if exists marketing_unsubscribes_product_check;
alter table public.marketing_unsubscribes
  add constraint marketing_unsubscribes_product_check
  check (product in ('visionworkx', 'chorebit', 'feelflow', 'mindbit', 'sanctum', 'proactive'));

alter table public.marketing_recurring_schedules
  drop constraint if exists marketing_recurring_schedules_product_check;
alter table public.marketing_recurring_schedules
  add constraint marketing_recurring_schedules_product_check
  check (product in ('visionworkx', 'chorebit', 'feelflow', 'mindbit', 'sanctum', 'proactive'));

alter table public.lifecycle_fires
  drop constraint if exists lifecycle_fires_product_check;
alter table public.lifecycle_fires
  add constraint lifecycle_fires_product_check
  check (product in ('visionworkx', 'chorebit', 'feelflow', 'mindbit', 'sanctum', 'proactive'));
