-- End the old app builder's leftover subscriptions. VisionWorkx pivoted to
-- Modules (billed separately, in the visionworkx-modules project), the
-- builder is frozen, and none of these rows was ever a Stripe subscription:
-- 10 starter trials that ended on 2026-07-17 but were never closed out, and
-- 2 comped "pro" rows. Nothing charges or reads them now; this just stops
-- them looking active.
--
-- Data-only, no schema change. Only touches non-Stripe rows still marked
-- active/trialing, so a real Stripe subscription (there are none) is never
-- affected, and re-running it is harmless. Rows are kept as history.

update public.subscriptions
set status = 'cancelled',
    current_period_end = least(coalesce(current_period_end, now()), now())
where stripe_subscription_id is null
  and status in ('active', 'trialing');

-- Rollback (by hand): the 12 affected ids and their previous status/period end
-- are listed in the PR that added this file; restore those rows individually.
