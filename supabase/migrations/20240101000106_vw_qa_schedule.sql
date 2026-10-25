-- QA testing schedule: how often each product's full ("nightly") QA run is
-- dispatched. One row per product holds an override; the row product_slug = '*'
-- holds the global default. A product row of 'default' (or no row at all)
-- follows the global default. Read and written only by the operator (/admin/qa)
-- and the /api/cron/qa-schedule cron, both server-side with the service-role key.
--
-- RLS: enabled with NO policies, so the anon and authenticated roles can't read
-- or write it; only the service-role key (which bypasses RLS) can — the same
-- pattern as the other vw_qa_* tables.

create table if not exists public.vw_qa_schedule (
  product_slug text primary key,
  cadence text not null check (cadence in ('default', 'nightly', 'every_2_days', 'every_3_days', 'weekly', 'off')),
  updated_at timestamptz not null default now(),
  updated_by text
);

alter table public.vw_qa_schedule enable row level security;

-- Seed the global default (every night) if it isn't set yet. The '*' row always
-- holds a concrete cadence, never 'default'.
insert into public.vw_qa_schedule (product_slug, cadence, updated_by)
values ('*', 'nightly', 'migration')
on conflict (product_slug) do nothing;
