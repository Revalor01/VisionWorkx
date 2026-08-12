-- =============================================================
-- Vision Workx — TikTok Content Posting integration (Migration 28)
-- =============================================================
--
-- TikTok tokens have a real expiry (short-lived access token + longer
-- refresh token), unlike Meta's non-expiring Page tokens — kept in
-- their own table rather than reusing social_connections, since the
-- refresh lifecycle is different enough to not share a shape.
--
-- The OAuth session table mirrors social_oauth_sessions (Migration 18)
-- but holds a PKCE code_verifier instead of a page list — TikTok's
-- authorization code exchange requires the original verifier.

alter table public.social_brands add column tiktok_open_id text;
alter table public.social_brands add column tiktok_username text;

create table public.social_tiktok_connections (
  id                       uuid primary key default gen_random_uuid(),
  brand_id                 uuid not null references public.social_brands(id) on delete cascade,
  access_token             text not null,
  refresh_token            text not null,
  access_token_expires_at  timestamptz not null,
  connected_at             timestamptz not null default now(),
  unique (brand_id)
);

create table public.social_tiktok_oauth_sessions (
  id             uuid primary key default gen_random_uuid(),
  brand_id       uuid not null references public.social_brands(id) on delete cascade,
  code_verifier  text not null,
  created_at     timestamptz not null default now()
);

alter table public.social_content drop constraint social_content_platform_check;
alter table public.social_content add constraint social_content_platform_check
  check (platform in ('facebook', 'instagram', 'tiktok'));

alter table public.social_tiktok_connections enable row level security;
alter table public.social_tiktok_oauth_sessions enable row level security;
-- No policies — service-role only, same as every other social_* table.
