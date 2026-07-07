-- =============================================================
-- Vision Workx — Lead language detection (Migration 13)
-- =============================================================
--
-- Flags leads likely to be Spanish-speaking businesses (from OSM
-- name:es tags or Spanish-language patterns in the business name) so
-- outreach can be pitched in the right language, and so businesses
-- that are a good fit for VisionWorkx's bilingual EN/ES app feature
-- are easy to filter for.

alter table public.leads
  add column detected_language text not null default 'en'
    constraint leads_detected_language_check
    check (detected_language in ('en', 'es'));

create index leads_detected_language_idx on public.leads(detected_language);
