-- =============================================================
-- Vision Workx — Yelp enrichment columns (Migration 14)
-- =============================================================
--
-- Adds the fields needed for Tier 2/3 signals that OSM alone can't
-- provide: review count, rating, and a few review excerpts (Yelp's
-- free API returns up to 3 short excerpts per business, not full
-- review text) for keyword-matching against booking/wait-time
-- complaints. Stored explicitly so a score is always auditable —
-- same reasoning as signal_breakdown on the original table.

alter table public.leads
  add column yelp_id text,
  add column yelp_rating numeric(2,1),
  add column yelp_review_count integer,
  add column yelp_review_excerpts jsonb not null default '[]'::jsonb;
