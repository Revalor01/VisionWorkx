-- =============================================================
-- LinkedIn posts: optional scheduled publish time (Migration 109)
-- =============================================================
--
-- Adds an optional scheduled_at to linkedin_posts so the owner can schedule
-- an APPROVED post. Scheduled posts appear in a token-protected RSS feed
-- (/api/social/linkedin/feed) that a Zapier "RSS by Zapier -> LinkedIn Create
-- Company Update" Zap watches, which posts them to the Revalor LLC page.
--
-- This still keeps LinkedIn out of the autonomous social pipeline
-- (cron/social-generate, cron/social-publish never read this table): a post
-- only goes out when a human has approved it AND given it a time.
--
-- Additive only: one nullable column and a partial index. No RLS change
-- (table stays default-deny, service-role only). `if not exists` so it is
-- safe if the SQL was already run by hand.
--
-- Shared table: revalor-admin reads linkedin_posts (Needs attention,
-- calendar) with explicit column lists, so a new column doesn't affect it.

alter table public.linkedin_posts
  add column if not exists scheduled_at timestamptz;

create index if not exists linkedin_posts_scheduled_idx
  on public.linkedin_posts(scheduled_at)
  where status = 'approved' and scheduled_at is not null;

-- Rollback (destructive: drops a column, needs explicit OK under CLAUDE.md):
--   drop index if exists public.linkedin_posts_scheduled_idx;
--   alter table public.linkedin_posts drop column if exists scheduled_at;
