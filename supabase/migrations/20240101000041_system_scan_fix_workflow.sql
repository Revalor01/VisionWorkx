-- Approve-then-execute workflow for system_scan_findings: a checkbox +
-- "Execute Changes" button on /system-scan marks findings approved here;
-- any Claude Code session (on either machine) with DB access can then
-- query `approved_at is not null and executed_at is null`, make the
-- actual fix locally, commit/push it, and mark executed_at.
alter table public.system_scan_findings
  add column if not exists suggested_fix text,
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by text,
  add column if not exists executed_at timestamptz,
  add column if not exists executed_by text,
  add column if not exists execution_note text;

create index if not exists system_scan_findings_pending_fix_idx
  on public.system_scan_findings (approved_at)
  where approved_at is not null and executed_at is null;
