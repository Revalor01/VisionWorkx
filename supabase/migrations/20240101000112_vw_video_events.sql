-- Product overview video plays on products.revalorllc.com, written server-side
-- by revalor-products' /api/video-event route and read (counts only) by
-- revalor-admin's /traffic/products page via its VisionWorkx service-role client.
--
-- No personal data: view_id is a random UUID made fresh on every page load and
-- is not linked to any person, cookie, IP address or account.
--
-- Access: RLS on with NO policies on purpose. Anon/authenticated clients can
-- neither read nor write; only service-role server code can.
--
-- Purely additive: touches no existing table.
create table if not exists public.vw_video_events (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  video       text not null check (video in
                ('proactive','visionworkx','consulting','revalor-kids','sanctum','elevate')),
  event       text not null check (event in ('play','p25','p50','complete')),
  placement   text not null check (placement in ('section','dialog')),
  view_id     uuid not null
);

-- One of each event per video per placement per page load, so replaying,
-- seeking back or a retried beacon can't inflate the counts.
create unique index if not exists vw_video_events_once
  on public.vw_video_events (view_id, video, event, placement);
create index if not exists vw_video_events_created_at_idx
  on public.vw_video_events (created_at desc);

alter table public.vw_video_events enable row level security;
-- No policies: service-role only (see header).
