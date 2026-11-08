-- Daily follower count per brand Page (owner, 2026-11-08), so Social → Performance can
-- show follower growth and when a Page nears the ~100 followers Facebook needs before
-- it shares reach and engagement stats. Written by /api/cron/social-metrics (every 6h,
-- one row per brand/platform/day, later runs that day update it). Read by
-- /api/social/performance. Both run server-side with the service role.

create table public.vw_social_page_followers (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.social_brands(id) on delete cascade,
  platform text not null default 'facebook' check (platform in ('facebook', 'instagram')),
  page_id text not null,
  followers integer not null check (followers >= 0),
  captured_on date not null default ((now() at time zone 'utc')::date),
  captured_at timestamptz not null default now(),
  unique (brand_id, platform, captured_on)
);

-- RLS on with NO policies: nobody signed in through the browser (anon or logged-in
-- users) can read or write it. Only the server's service role, which bypasses RLS,
-- uses it — the same as the other social tables.
alter table public.vw_social_page_followers enable row level security;

-- Rollback (by hand only, with explicit OK):
--   drop table if exists public.vw_social_page_followers;
