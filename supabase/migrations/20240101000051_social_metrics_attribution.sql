-- Social Media Manager: per-post performance metrics + link-click
-- attribution. Until now the content engine only had "which platforms
-- generate the most DMs" as a proxy for what's working (see
-- lib/social/topicSeeds.ts). This wires up real signal.

-- ── Per-post metric snapshots ──────────────────────────────────────────
-- Engagement keeps accruing for ~2 weeks after a post goes out, so we
-- snapshot repeatedly (one row per post per day, updated in place by the
-- cron) and keep the history.
create table public.social_content_metrics (
  id                uuid primary key default gen_random_uuid(),
  social_content_id uuid not null references public.social_content(id) on delete cascade,
  captured_on       date not null default (now() at time zone 'utc')::date,
  source            text not null,          -- 'meta_graph' | 'socialapi' | 'redirect_only'
  impressions       integer,
  reach             integer,
  likes             integer,
  comments          integer,
  shares            integer,
  saves             integer,
  video_views       integer,
  link_clicks       integer,                -- native platform link clicks (Facebook)
  tracked_clicks    integer,                -- our /go/<code> redirector clicks for this post
  engagement_rate   numeric,                -- (likes+comments+shares+saves) / reach
  raw               jsonb not null default '{}'::jsonb,
  captured_at       timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (social_content_id, captured_on)
);
create index social_content_metrics_content_idx
  on public.social_content_metrics(social_content_id, captured_on desc);

alter table public.social_content_metrics enable row level security;
-- Service-role only, same trust boundary as social_content itself: no policies.

-- ── Branded short links for click attribution ─────────────────────────
-- Every social post that carries a clickable link (Facebook feed link,
-- YouTube description link) gets one of these; the post's URL becomes
-- <base>/go/<code>, which logs the click and 302s to destination_url.
create table public.short_links (
  id                uuid primary key default gen_random_uuid(),
  code              text not null unique,
  destination_url   text not null,          -- final URL, UTM params included
  social_content_id uuid references public.social_content(id) on delete set null,
  brand_id          uuid references public.social_brands(id) on delete set null,
  platform          text,
  campaign          text,
  created_at        timestamptz not null default now()
);
create index short_links_content_idx on public.short_links(social_content_id);
create index short_links_brand_idx on public.short_links(brand_id);

create table public.link_clicks (
  id            uuid primary key default gen_random_uuid(),
  short_link_id uuid not null references public.short_links(id) on delete cascade,
  clicked_at    timestamptz not null default now(),
  referrer      text,
  user_agent    text,
  ip_hash       text,          -- sha256(ip + rotating salt); rough unique counting, no raw IPs
  is_bot        boolean not null default false
);
create index link_clicks_link_idx on public.link_clicks(short_link_id, clicked_at desc);

alter table public.short_links enable row level security;
alter table public.link_clicks enable row level security;
-- link_clicks rows are the source of truth for click counts; aggregate
-- from there rather than denormalising onto short_links.
