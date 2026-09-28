-- APPLY TO: visionworkx-modules (project vgyvycepumnrtseciofx), NOT the main project.
--
-- Workspaces created by the QA suite. Excluded from admin stats, billing and
-- usage alerts; the suite deletes its own is_test workspaces after each run.
-- Access (plain English): unchanged -- not added to the column grants, so
-- members can't see or set it; only the server can.
alter table public.vw_workspaces
  add column if not exists is_test boolean not null default false;
create index if not exists vw_workspaces_is_test_idx
  on public.vw_workspaces (is_test) where is_test;
