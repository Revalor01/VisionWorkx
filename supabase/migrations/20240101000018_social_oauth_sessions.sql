-- =============================================================
-- Vision Workx — Social OAuth Sessions (Migration 18)
-- =============================================================
--
-- A Meta OAuth callback can return several managed Pages (an admin's
-- Facebook user may manage pages beyond just Revalor's), so the admin
-- needs to pick which Page maps to which brand before we store a
-- permanent connection. The long-lived user token and page list are
-- held here server-side only, and never passed through a redirect URL
-- (Referer-header/browser-history leakage risk), just an opaque session
-- id. Short-lived by convention — the finalize route deletes the row
-- immediately after use, and rows older than 15 minutes are treated as
-- expired by the finalize route even if not yet cleaned up.

create table public.social_oauth_sessions (
  id           uuid primary key default gen_random_uuid(),
  brand_id     uuid not null references public.social_brands(id) on delete cascade,
  user_token   text not null,
  pages_json   jsonb not null,
  created_at   timestamptz not null default now()
);

alter table public.social_oauth_sessions enable row level security;
-- No policies — service-role only, same as every other social_* table.
