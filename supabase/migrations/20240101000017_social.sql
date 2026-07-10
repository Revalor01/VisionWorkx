-- =============================================================
-- Vision Workx — Social Media Manager (Migration 17)
-- =============================================================
--
-- Internal tool for Revalor to manage social posting across its own
-- products (VisionWorkx, Promote, Automations, Sanctum) — not a
-- customer-facing feature, never resold. Same access model as `leads`
-- (Migration 12): RLS enabled with no policies, default-deny for
-- anon/authenticated, accessed exclusively via the service-role client
-- from admin-gated routes (app/admin/social + app/api/social/*).

create table public.social_brands (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  slug               text not null unique,
  voice_notes        text,
  faq_document       text,
  fb_page_id         text,
  ig_business_id     text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- Long-lived Meta tokens — kept in a separate table so the token
-- blob never rides along on ordinary social_brands reads.
create table public.social_connections (
  id                     uuid primary key default gen_random_uuid(),
  brand_id               uuid not null references public.social_brands(id) on delete cascade,
  fb_page_access_token   text not null,
  token_expires_at       timestamptz,
  connected_at           timestamptz not null default now(),
  unique (brand_id)
);

create table public.social_video_assets (
  id               uuid primary key default gen_random_uuid(),
  brand_id         uuid not null references public.social_brands(id) on delete cascade,
  status           text not null default 'raw'
                     constraint social_video_assets_status_check
                     check (status in ('raw', 'in_editing', 'ready', 'posted')),
  raw_path         text not null,
  final_path       text,
  editor_email     text,
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table public.social_content (
  id               uuid primary key default gen_random_uuid(),
  brand_id         uuid not null references public.social_brands(id) on delete cascade,
  video_asset_id   uuid references public.social_video_assets(id) on delete set null,
  platform         text not null
                     constraint social_content_platform_check
                     check (platform in ('facebook', 'instagram')),
  hook             text,
  caption          text not null,
  hashtags         text[] not null default '{}',
  status           text not null default 'draft'
                     constraint social_content_status_check
                     check (status in ('draft', 'approved', 'scheduled', 'posted', 'failed')),
  scheduled_at     timestamptz,
  posted_at        timestamptz,
  platform_post_id text,
  failure_reason   text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table public.social_inbox_items (
  id               uuid primary key default gen_random_uuid(),
  brand_id         uuid not null references public.social_brands(id) on delete cascade,
  platform         text not null
                     constraint social_inbox_items_platform_check
                     check (platform in ('facebook', 'instagram')),
  source_type      text not null
                     constraint social_inbox_items_source_type_check
                     check (source_type in ('dm', 'comment')),
  sender_id        text not null,
  sender_name      text,
  message_text     text not null,
  classification   text not null
                     constraint social_inbox_items_classification_check
                     check (classification in ('auto_answered', 'requires_human')),
  auto_reply_text  text,
  status           text not null default 'open'
                     constraint social_inbox_items_status_check
                     check (status in ('open', 'resolved')),
  created_at       timestamptz not null default now(),
  resolved_at      timestamptz
);

-- Allow-list for the hired video editor's narrower access to the
-- Video tab, independent of the single hardcoded ADMIN_EMAIL check —
-- lets an editor be added/removed without a redeploy.
create table public.social_editors (
  email      text primary key,
  added_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- INDEXES
-- ---------------------------------------------------------------

create index social_video_assets_brand_id_idx on public.social_video_assets(brand_id);
create index social_video_assets_status_idx on public.social_video_assets(status);
create index social_content_brand_id_idx on public.social_content(brand_id);
create index social_content_status_idx on public.social_content(status);
create index social_content_scheduled_at_idx on public.social_content(scheduled_at) where status = 'scheduled';
create index social_inbox_items_brand_id_idx on public.social_inbox_items(brand_id);
create index social_inbox_items_status_idx on public.social_inbox_items(status);

-- ---------------------------------------------------------------
-- ROW LEVEL SECURITY — service-role only, no policies, matching leads
-- ---------------------------------------------------------------

alter table public.social_brands enable row level security;
alter table public.social_connections enable row level security;
alter table public.social_video_assets enable row level security;
alter table public.social_content enable row level security;
alter table public.social_inbox_items enable row level security;
alter table public.social_editors enable row level security;

-- ---------------------------------------------------------------
-- STORAGE: social-video-assets bucket — PRIVATE (unlike promote-assets,
-- this is Revalor's own unpublished raw footage, never public)
-- ---------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'social-video-assets',
  'social-video-assets',
  false,
  524288000, -- 500 MB — raw phone footage
  array['video/mp4', 'video/quicktime', 'video/x-m4v']
);

-- No storage.objects policies — raw footage can be large (up to 500MB),
-- too big to proxy through a Vercel serverless function body, so the
-- browser uploads directly to Supabase Storage using a short-lived
-- signed upload URL. That URL is only minted server-side (service-role
-- client) after checking the caller against ADMIN_EMAIL/social_editors
-- — see app/api/social/video-assets. The bucket itself stays fully
-- locked down; nothing is reachable without that signed URL.
