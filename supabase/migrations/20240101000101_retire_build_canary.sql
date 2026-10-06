-- Retire the build canary (the old full-app builder's nightly reliability
-- test). Full-app generation was frozen on 2026-09-25 (PR #79) and VisionWorkx
-- pivoted to Modules; the canary's cron entry and GitHub workflow are removed
-- in the same PR as this migration.
--
-- The last batch it fired (2026-09-25 05:00 UTC) was never graded, so those
-- rows sit at 'pending' forever. Mark them cancelled so nothing reads them as
-- in-flight. Data-only, no schema change; only touches rows still 'pending',
-- so re-running it is harmless. History rows are kept.

update public.build_canary_runs
set status = 'cancelled',
    failure_reason = coalesce(failure_reason, 'Canary retired: full-app generation frozen (Modules pivot)'),
    graded_at = coalesce(graded_at, now())
where status = 'pending';

-- Rollback (by hand, only if reviving the canary — re-enables nothing by itself):
--   update public.build_canary_runs set status = 'pending', graded_at = null
--   where status = 'cancelled' and failure_reason like 'Canary retired:%';
