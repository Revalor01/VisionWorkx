-- CAN-SPAM compliance for the cold-outreach lead-email route
-- (app/api/admin/leads/email): adds a hard suppression flag, separate
-- from `status` (which tracks sales-pipeline stage, not opt-out state).
-- A lead can be do_not_email regardless of what stage it's in, and this
-- must never get reset by ordinary status transitions elsewhere.

alter table public.leads
  add column do_not_email boolean not null default false;

create index leads_do_not_email_idx on public.leads(do_not_email) where do_not_email = true;
