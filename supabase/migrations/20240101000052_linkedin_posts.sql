-- =============================================================
-- LinkedIn — manual-only posting section (Migration 52)
-- =============================================================
--
-- Deliberately NOT modeled as another social_content platform: LinkedIn
-- has no API connection (no SocialAPI.ai/Meta-style OAuth), so there is no
-- account to auto-publish to and it must never be swept into the
-- autonomous cron pipeline (app/api/cron/social-generate,
-- app/api/cron/social-publish) that social_content's other platforms go
-- through. A separate table keeps it structurally impossible for that
-- pipeline to touch LinkedIn drafts by accident. Always represents Revalor
-- LLC (the only brand with a LinkedIn presence) - no brand_id needed.
create table public.linkedin_posts (
  id               uuid primary key default gen_random_uuid(),
  video_asset_id   uuid references public.social_video_assets(id) on delete set null,
  hook             text,
  caption          text not null,
  hashtags         text[] not null default '{}',
  status           text not null default 'draft'
                     constraint linkedin_posts_status_check
                     check (status in ('draft', 'approved', 'posted')),
  posted_at        timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index linkedin_posts_status_idx on public.linkedin_posts(status);

alter table public.linkedin_posts enable row level security;
-- No policies — default-deny, service-role only, matching every other
-- admin-only table in this schema.
