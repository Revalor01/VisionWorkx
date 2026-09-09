-- Guided Build Session requests. The landing CTA ("Request your session")
-- now takes a real email + password (creates an account) and files a row
-- here; the operator runs the session and delivers the build brief +
-- preview to that email. The $10 charge is handled separately for now.

create table if not exists guided_session_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  email text not null,
  full_name text,
  business_name text,
  business_type text,
  description text,
  status text not null default 'requested',
  created_at timestamptz not null default now(),
  constraint guided_session_requests_status_check
    check (status in ('requested', 'scheduled', 'delivered', 'cancelled'))
);

alter table guided_session_requests enable row level security;

drop policy if exists "own guided session requests" on guided_session_requests;
create policy "own guided session requests" on guided_session_requests
  for select
  using (auth.uid() = user_id);

create index if not exists guided_session_requests_created_idx
  on guided_session_requests (created_at desc);
