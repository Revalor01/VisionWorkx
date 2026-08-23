-- =============================================================
-- Vision Workx — Autonomous social content engine (Migration 34)
-- =============================================================
--
-- Adds an opt-in autonomous content loop on top of the existing manual
-- generate/approve/publish flow: per-brand autonomy toggle + risk mode,
-- a banned-word/risk-tier approval gate, and a flag table that both
-- alerts and auto-pauses a brand's autonomy the moment something needs
-- human input (banned word caught, high-risk content, a failed publish).
-- Every brand defaults to autonomy_enabled = false — nothing changes
-- for existing brands until it's explicitly turned on.

alter table public.social_brands
  add column autonomy_enabled boolean not null default false,
  add column autonomy_mode text not null default 'semi_autonomous'
    constraint social_brands_autonomy_mode_check check (autonomy_mode in ('manual','semi_autonomous','fully_autonomous')),
  add column banned_words text[] not null default '{}',
  add column content_topics text[] not null default '{}',
  add column posting_frequency_per_day int not null default 1,
  add column autonomy_paused_at timestamptz,
  add column autonomy_paused_reason text;

alter table public.social_content
  add column risk_level text
    constraint social_content_risk_level_check check (risk_level in ('low','medium','high')),
  add column generated_by text not null default 'manual'
    constraint social_content_generated_by_check check (generated_by in ('manual','autonomous'));

create table public.social_autonomy_flags (
  id            uuid primary key default gen_random_uuid(),
  brand_id      uuid not null references public.social_brands(id) on delete cascade,
  content_id    uuid references public.social_content(id) on delete set null,
  kind          text not null check (kind in ('banned_word','high_risk','publish_failure','inbox_escalation')),
  detail        text not null,
  created_at    timestamptz not null default now(),
  resolved_at   timestamptz
);

create index social_autonomy_flags_brand_idx on public.social_autonomy_flags(brand_id) where resolved_at is null;
