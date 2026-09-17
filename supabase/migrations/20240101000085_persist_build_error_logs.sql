-- Captures the real compiler/build error text so a failed build is
-- actually diagnosable after the fact, instead of only the coarse
-- classifyBuildError() category ("build_error", "timeout", etc).
--
-- Found 2026-09-17: the first post-PR#47 canary batch failed 4/5 with
-- failure_reason="build_error" — genuinely new information (PR #47's
-- chained-handoff timeout fix looks like it worked, 0/5 timeouts), but
-- there was no way to tell if it's one shared root cause or four
-- unrelated flukes, because:
--   1. apps.failure_reason only ever stores the coarse category, never
--      the raw Vercel build log or preflight compiler output (both are
--      available in app/api/deploy/route.ts's BuildError/PreflightError
--      catch block — err.logs / err.log — but were only ever passed to
--      the one-shot operator email, never persisted).
--   2. Canary apps get torn down (Vercel project deleted) shortly after
--      grading, so even the live Vercel deployment's build log is gone
--      by the time anyone looks.
--
-- apps.build_error_log: written at the same point failure_reason is set
-- (app/api/deploy/route.ts), holds the raw compiler output, truncated.
-- build_canary_runs.build_log: copied from apps.build_error_log at
-- grading time (app/api/cron/canary-build/route.ts), BEFORE teardown
-- deletes the apps row — this is what actually survives.

alter table public.apps
  add column build_error_log text;

alter table public.build_canary_runs
  add column build_log text;
