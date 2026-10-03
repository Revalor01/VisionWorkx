-- One row per email sent by Revalor apps (first: revalor-products' AI quiz
-- emails, tips and call alerts), so revalor-admin's /costs page can show email
-- volume against the Resend plan. No personal data: no address, no content.
--
-- Access: RLS on with NO policies; only service-role server code can read or
-- write. revalor-products inserts; revalor-admin reads (shared table).
-- Purely additive: touches no existing table.
create table if not exists public.vw_email_send_log (
  id       bigint generated always as identity primary key,
  sent_at  timestamptz not null default now(),
  app      text not null check (char_length(app) between 1 and 40),
  kind     text not null check (char_length(kind) between 1 and 40),
  is_test  boolean not null default false
);

create index if not exists vw_email_send_log_sent_at_idx on public.vw_email_send_log (sent_at desc);

alter table public.vw_email_send_log enable row level security;
-- No policies: service-role only (see header).
