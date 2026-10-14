-- =============================================================
-- Vision Workx — Social: Competitor Watch intake (Migration 104)
-- =============================================================
--
-- Revalor Social (app/admin/social) imports post ideas produced by
-- revalor-admin's Competitor Watch (table public.rv_competitor_post_ideas,
-- status 'sent_to_social') as DRAFTS. These three additive columns on
-- social_content mark where a draft came from, link it back to the source
-- idea (for idempotent intake), and carry a review flag when the generated
-- copy names a tracked competitor.
--
-- Additive only: no drops, renames, or column removals. social_content
-- already has RLS enabled with NO policies (service-role-only, matching
-- `leads`), so these columns need no new policy — they are reachable only
-- through the service-role client from admin-gated routes and the
-- CRON_SECRET-checked cron, exactly like every other social_content column.

alter table public.social_content
  -- Where the draft came from. 'internal' = the normal manual/autonomous
  -- generator; 'competitor_watch' = imported from rv_competitor_post_ideas.
  add column source text not null default 'internal'
    constraint social_content_source_check check (source in ('internal', 'competitor_watch')),
  -- The rv_competitor_post_ideas.id this draft was created from. No foreign
  -- key: that table is owned by revalor-admin (its migrations live in that
  -- repo) and this repo must not couple its schema to it. Nullable — only
  -- competitor-watch drafts set it.
  add column source_idea_id uuid,
  -- Set when the imported copy mentions a tracked competitor's name
  -- (rv_competitors.name). Shown as a review flag in the drafts UI; it does
  -- not block, because competitor-watch drafts are manual-approval anyway.
  add column competitor_flag text;

-- One draft per source idea — a second intake run can never import the same
-- idea twice, even if the back-link write to rv_competitor_post_ideas failed.
create unique index social_content_source_idea_idx
  on public.social_content (source_idea_id)
  where source_idea_id is not null;

-- Rollback (by hand only, with explicit OK):
--   drop index if exists public.social_content_source_idea_idx;
--   alter table public.social_content
--     drop column competitor_flag,
--     drop column source_idea_id,
--     drop column source;
