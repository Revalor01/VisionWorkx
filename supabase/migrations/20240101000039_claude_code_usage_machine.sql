-- claude_code_usage already exists live (created directly against this DB
-- from the Mac's local Claude Code setup, outside of migration history)
-- with one global row: id, five_hour_pct, five_hour_resets_at,
-- seven_day_pct, seven_day_resets_at, session_cost_usd, context_pct,
-- created_at. Read by revalor-admin's /ai-usage page.
--
-- Adding `machine` so each machine (Mac Mini, Windows desktop, ...) gets its
-- own row instead of a single shared snapshot. The default backfills the
-- existing row as 'mac-mini' and means the Mac's existing reporting script
-- (which doesn't send `machine`) keeps working unmodified.
alter table public.claude_code_usage
  add column if not exists machine text not null default 'mac-mini';

-- One row per machine, upserted in place on every statusLine report
-- (rather than growing one row per event) — only one row exists today
-- (the Mac's), so this is safe to add now.
alter table public.claude_code_usage
  add constraint claude_code_usage_machine_key unique (machine);
