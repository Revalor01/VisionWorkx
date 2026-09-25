-- VisionWorkx waitlist (A2): signups from products.revalorllc.com/visionworkx/waitlist,
-- written server-side by revalor-products' /api/visionworkx/waitlist route.
--
-- Access: RLS on with NO policies on purpose — anon/authenticated clients can
-- neither read nor write. Only service-role server code can: the
-- revalor-products route (insert) and, later, revalor-admin (read-only list +
-- count via its existing VisionWorkx service-role client).
--
-- Purely additive: touches no existing table.
create table if not exists public.vw_waitlist (
  id                   uuid primary key default gen_random_uuid(),
  created_at           timestamptz not null default now(),
  name                 text not null check (char_length(name) between 1 and 120),
  email                text not null check (char_length(email) between 3 and 254),
  business_name        text not null check (char_length(business_name) between 1 and 160),
  website_url          text check (char_length(website_url) <= 300),
  website_builder      text not null check (website_builder in
                         ('wordpress','squarespace','wix','webflow','framer','shopify','other','none')),
  first_module         text not null check (first_module in
                         ('lead_capture','booking','quote_calculator','intake_form','other')),
  source               text not null default 'products-site',
  confirmation_sent_at timestamptz
);

create unique index if not exists vw_waitlist_email_key on public.vw_waitlist (lower(email));
create index if not exists vw_waitlist_created_at_idx on public.vw_waitlist (created_at desc);

alter table public.vw_waitlist enable row level security;
-- No policies: service-role only (see header).
