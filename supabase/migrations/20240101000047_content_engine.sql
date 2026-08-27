-- =============================================================
-- Vision Workx — Content Engine (Migration 47)
-- =============================================================
--
-- One source content item auto-drafts derivatives across every channel.
-- Deliberately does NOT introduce new generation or sending machinery —
-- content_derivatives just links back to the real row in whichever
-- existing table actually owns that channel (blog_posts, social_content,
-- marketing_campaigns), so publishing/sending stays exactly what
-- Projects 02-04 (and the pre-existing blog/social engines) already do.

create table public.content_items (
  id                uuid primary key default gen_random_uuid(),
  product           text not null
                      constraint content_items_product_check
                      check (product in ('visionworkx', 'chorebit', 'feelflow', 'mindbit', 'sanctum')),
  source_type       text not null default 'update'
                      constraint content_items_source_type_check
                      check (source_type in ('blog', 'announcement', 'update')),
  title             text not null,
  body              text not null,
  keyword_cluster   text[] not null default '{}',
  status            text not null default 'draft'
                      constraint content_items_status_check
                      check (status in ('draft', 'ready', 'archived')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Extends the evergreen "content topics" idea (social_brands.content_topics,
-- migration 17) into a per-product calendar with cadence + an optional
-- keyword cluster for SEO grounding — a separate table rather than widening
-- social_brands' because this is scoped to a MarketingProduct (5 products),
-- not a social_brands row (brands and products aren't 1:1 — e.g. "Revalor
-- Kids" is one brand covering three products).
create table public.content_topics (
  id                uuid primary key default gen_random_uuid(),
  product           text not null
                      constraint content_topics_product_check
                      check (product in ('visionworkx', 'chorebit', 'feelflow', 'mindbit', 'sanctum')),
  topic             text not null,
  keyword_cluster   text[] not null default '{}',
  cadence           text not null default 'on_demand'
                      constraint content_topics_cadence_check
                      check (cadence in ('weekly', 'monthly', 'on_demand')),
  day_of_week       integer
                      constraint content_topics_dow_check
                      check (day_of_week is null or day_of_week between 0 and 6),
  day_of_month      integer
                      constraint content_topics_dom_check
                      check (day_of_month is null or day_of_month between 1 and 31),
  hour_utc          integer not null default 13
                      constraint content_topics_hour_check
                      check (hour_utc between 0 and 23),
  -- Which connected social_brands row this product's social derivatives post
  -- under. Nullable and admin-set, not inferred — there's no reliable
  -- product -> brand mapping in the existing data model to infer it from.
  social_brand_id   uuid references public.social_brands(id) on delete set null,
  active            boolean not null default true,
  next_run_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index content_topics_next_run_idx
  on public.content_topics(next_run_at) where active = true and cadence <> 'on_demand';

-- One row per channel derivative of a content_item. Only the column
-- matching `channel` (blog_post_id / social_content_id /
-- marketing_campaign_id) is ever populated — the derivative's own
-- lifecycle lives in that channel's real table (status there is
-- authoritative once generated); `status` here tracks this row's own
-- generation/dispatch state before and independent of that.
create table public.content_derivatives (
  id                    uuid primary key default gen_random_uuid(),
  content_item_id       uuid not null references public.content_items(id) on delete cascade,
  channel               text not null
                          constraint content_derivatives_channel_check
                          check (channel in ('blog', 'social', 'email', 'push', 'sms')),
  platform              text
                          constraint content_derivatives_platform_check
                          check (platform is null or platform in ('facebook', 'instagram', 'tiktok', 'youtube')),
  autonomy              text not null default 'manual'
                          constraint content_derivatives_autonomy_check
                          check (autonomy in ('manual', 'auto')),
  status                text not null default 'pending'
                          constraint content_derivatives_status_check
                          check (status in ('pending', 'generated', 'pending_review', 'approved', 'published', 'failed')),
  subject               text,
  body                  text,
  blog_post_id          uuid references public.blog_posts(id) on delete set null,
  social_content_id     uuid references public.social_content(id) on delete set null,
  marketing_campaign_id uuid references public.marketing_campaigns(id) on delete set null,
  error                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index content_derivatives_item_idx on public.content_derivatives(content_item_id);

alter table public.content_items enable row level security;
alter table public.content_topics enable row level security;
alter table public.content_derivatives enable row level security;
-- No policies on any of the three — default-deny, same as every other
-- admin-only table in this schema. Service-role client only.

-- Traceability: a social post the content engine created (from a source
-- item, not the autonomous per-brand pipeline) is neither "manual" nor
-- "autonomous" in the existing sense.
alter table public.social_content drop constraint if exists social_content_generated_by_check;
alter table public.social_content add constraint social_content_generated_by_check
  check (generated_by in ('manual', 'autonomous', 'content_engine'));
