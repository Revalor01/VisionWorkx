-- =============================================================
-- Vision Workx — Lead distance from search origin (Migration 15)
-- =============================================================
--
-- Distance from the most recent search's origin point (the geocoded
-- location typed into the search box), in miles. Recomputed and
-- overwritten each time a search touches this lead — same "reflects
-- latest known state" model as the other score/status columns,
-- consistent with how the rest of this table already works rather
-- than tracking per-search history.

alter table public.leads
  add column distance_miles numeric(6,2);

create index leads_distance_miles_idx on public.leads(distance_miles);
