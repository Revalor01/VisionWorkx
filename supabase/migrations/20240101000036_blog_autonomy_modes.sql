-- Per-product autonomy modes for the blog pipeline (mirrors social_brands'
-- manual/semi_autonomous/fully_autonomous system, migration 34) — but scored
-- and safety-gated instead of risk-classified, since blog posts only carry
-- an SEO score + banned-word check, not a per-post risk tier.
--
-- manual:            never auto-publish, always a draft for review.
-- semi_autonomous:    auto-publish only above the stricter score bar.
-- fully_autonomous:   auto-publish above the standard score bar (today's
--                     global default behavior from migration 35).
--
-- A banned-word hit in a non-manual product raises a flag AND pauses that
-- product's autonomy (autonomy_paused_at) until a human clears it from the
-- dashboard — same fail-safe pattern as social.
create table public.blog_product_config (
  product                text primary key
                           constraint blog_product_config_product_check
                           check (product in ('visionworkx', 'chorebit', 'feelflow', 'mindbit', 'sanctum')),
  autonomy_mode          text not null default 'fully_autonomous'
                           constraint blog_product_config_mode_check
                           check (autonomy_mode in ('manual', 'semi_autonomous', 'fully_autonomous')),
  banned_words           text[] not null default '{}',
  autonomy_paused_at     timestamptz,
  autonomy_paused_reason text,
  updated_at             timestamptz not null default now()
);

-- Kids products (Chorebit, FeelFlow, MindBit) start manual per the user's
-- call that they need tighter control; VisionWorkx/Sanctum keep today's
-- existing fully-autonomous (score >= 80) behavior unchanged.
insert into public.blog_product_config (product, autonomy_mode) values
  ('visionworkx', 'fully_autonomous'),
  ('sanctum', 'fully_autonomous'),
  ('chorebit', 'manual'),
  ('feelflow', 'manual'),
  ('mindbit', 'manual');

create table public.blog_autonomy_flags (
  id          uuid primary key default gen_random_uuid(),
  product     text not null,
  post_id     uuid references public.blog_posts(id) on delete set null,
  kind        text not null check (kind in ('banned_word')),
  detail      text not null,
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);

create index blog_autonomy_flags_product_idx on public.blog_autonomy_flags(product) where resolved_at is null;

alter table public.blog_product_config enable row level security;
alter table public.blog_autonomy_flags enable row level security;
