-- Needs Analyzer sync bookkeeping: the offline app's updatedAt that the last sync
-- wrote to this row. The sync route compares it with updated_at (bumped by every
-- online edit) to tell "changed online since the last sync" from "only changed on
-- the laptop", so a sync never silently overwrites an online edit.
-- Null for assessments created online. No RLS change (the table's RLS stays on,
-- no policies).
alter table vw_na_assessments add column if not exists synced_at timestamptz;
