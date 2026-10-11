-- Elevate waitlist: signups from products.revalorllc.com/wellness (Elevate card),
-- written server-side by revalor-products' /api/elevate/waitlist route.
--
-- Access: RLS on with NO policies on purpose — anon/authenticated clients can
-- neither read nor write. Only service-role server code can: the
-- revalor-products route (insert) and, later, revalor-admin (read-only list +
-- count via its existing VisionWorkx service-role client).
--
-- Purely additive: touches no existing table.
create table if not exists public.vw_elevate_waitlist (
  id                   uuid primary key default gen_random_uuid(),
  created_at           timestamptz not null default now(),
  email                text not null check (char_length(email) between 3 and 254),
  source               text not null default 'products-site',
  confirmation_sent_at timestamptz
);

create unique index if not exists vw_elevate_waitlist_email_key on public.vw_elevate_waitlist (lower(email));
create index if not exists vw_elevate_waitlist_created_at_idx on public.vw_elevate_waitlist (created_at desc);

alter table public.vw_elevate_waitlist enable row level security;
-- No policies: service-role only (see header).
