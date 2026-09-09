-- Extend apps_status_check with 'test_skipped' — the status the /try
-- flow records when a tester runs through the form + recommender with a
-- TRY_TEST_CODES code (?k=<code>) and the build is intentionally not run.
-- Original set defined in 20240101000000_init.sql.

alter table public.apps drop constraint if exists apps_status_check;
alter table public.apps add constraint apps_status_check
  check (status in ('generating', 'ready', 'deploying', 'deployed', 'failed', 'deploy_failed', 'test_skipped'));

-- Force a PostgREST schema-cache reload (see HANDOFF.md).
comment on table public.apps is 'generated apps; status extended with test_skipped for /try test mode';
