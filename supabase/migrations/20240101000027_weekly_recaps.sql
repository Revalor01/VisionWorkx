create table weekly_recaps (
  id uuid primary key default gen_random_uuid(),
  week_start date not null unique,
  stats jsonb not null,
  script text,
  video_prompt text,
  video_path text,
  status text not null default 'draft' check (status in ('draft', 'video_ready')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table weekly_recaps enable row level security;
-- No policies — service-role only, matches every other social_* table.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'weekly-recap-videos',
  'weekly-recap-videos',
  false,
  104857600, -- 100 MB
  array['video/mp4']
);
