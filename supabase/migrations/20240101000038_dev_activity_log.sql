-- Cross-machine dev activity log: one row per push, written by
-- scripts/log-dev-activity.mjs from whichever machine (Windows/Mac) just
-- pushed, read by the admin dashboard and by Claude Code at session start.
create table if not exists dev_activity_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  machine text not null,
  summary text not null,
  branch text,
  commit_sha text,
  version text
);

create index if not exists dev_activity_log_created_at_idx
  on dev_activity_log (created_at desc);

-- RLS enabled with no policies: all access goes through the service-role
-- client in app/api/dev-log/route.ts (bearer-secret protected), which
-- bypasses RLS. No browser client should ever query this table directly.
alter table dev_activity_log enable row level security;
