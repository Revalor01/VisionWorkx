-- Phase 6b of "Closing the Builder Loop": multi-capability apps.
--
-- A real business often needs more than one of our categories — a gym is
-- booking + membership + CRM. `category` stays the primary (it drives the
-- automation catalogue, headline metrics, payments gating). This adds up to
-- a few secondary capabilities that are additive to the generation prompt
-- and to the Automations / Insights panels.

alter table public.apps
  add column if not exists secondary_categories text[] not null default '{}';
