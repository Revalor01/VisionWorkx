-- Internal SEO/blog marketing tool — generates and publishes content that
-- markets Revalor's own product lineup (VisionWorkx, Chorebit, FeelFlow,
-- MindBit, Sanctum). Admin-only, same trust boundary as social_* tables:
-- RLS enabled with no policies at all, so only the service-role client
-- (used by /admin/seo and the public /blog pages, both server-side) can
-- read or write. No anon/authenticated access, ever.

create table public.blog_keywords (
  id            uuid primary key default gen_random_uuid(),
  product       text not null
                  constraint blog_keywords_product_check
                  check (product in ('visionworkx', 'chorebit', 'feelflow', 'mindbit', 'sanctum')),
  keyword       text not null,
  volume        integer,
  difficulty    integer,
  cpc           numeric,
  source        text not null default 'google_autocomplete',
  used          boolean not null default false,
  discovered_at timestamptz not null default now(),
  unique (product, keyword)
);

create table public.blog_posts (
  id                uuid primary key default gen_random_uuid(),
  product           text not null
                      constraint blog_posts_product_check
                      check (product in ('visionworkx', 'chorebit', 'feelflow', 'mindbit', 'sanctum')),
  keyword           text not null,
  title             text not null,
  slug              text not null unique,
  meta_description  text,
  excerpt           text,
  body              text not null,
  faqs              jsonb not null default '[]'::jsonb,
  tags              text[] not null default '{}',
  seo_score         integer,
  status            text not null default 'draft'
                      constraint blog_posts_status_check
                      check (status in ('draft', 'published')),
  created_at        timestamptz not null default now(),
  published_at      timestamptz
);

create table public.blog_run_log (
  id        uuid primary key default gen_random_uuid(),
  run_at    timestamptz not null default now(),
  status    text not null,
  summary   text
);

alter table public.blog_keywords enable row level security;
alter table public.blog_posts enable row level security;
alter table public.blog_run_log enable row level security;
