-- APPLY TO: the MAIN VisionWorkx Supabase project (NOT visionworkx-modules).
--
-- Revalor QA suite (Playwright via GitHub Actions, reported to /admin/qa).
-- Access (plain English): RLS on with no policies on every table -- nobody
-- but the server (service role) can read or write. /admin/qa reads through
-- the existing admin guard; the test runner writes through
-- /api/admin/qa/report with QA_REPORT_SECRET.

create table public.vw_qa_products (
  slug             text primary key check (slug ~ '^[a-z0-9-]{2,40}$'),
  name             text not null,
  base_url         text not null check (base_url ~ '^https://'),
  enabled          boolean not null default true,
  created_at       timestamptz not null default now()
);

-- Catalog synced from qa/products/** on every run; manual checks live here too.
create table public.vw_qa_tests (
  id               text primary key,               -- "visionworkx/booking/double-booking"
  product_slug     text not null references public.vw_qa_products(slug) on delete cascade,
  area             text not null,                  -- "Booking"
  title            text not null,
  tags             text[] not null default '{}',   -- smoke, mobile, ...
  requires         text[] not null default '{}',   -- stripe-test, google-qa
  manual           boolean not null default false,
  instructions     text,                           -- manual checks only
  active           boolean not null default true,  -- false once removed from code
  last_synced_at   timestamptz not null default now(),
  created_at       timestamptz not null default now()
);
create index vw_qa_tests_product_idx on public.vw_qa_tests (product_slug, area);

create table public.vw_qa_runs (
  id               uuid primary key default gen_random_uuid(),
  product_slug     text not null references public.vw_qa_products(slug) on delete cascade,
  target_env       text not null check (target_env in ('production','preview')),
  target_url       text not null check (target_url ~ '^https://'),
  selection        text not null check (selection in ('smoke','all','custom','nightly')),
  test_ids         text[] not null default '{}',
  status           text not null default 'queued'
                   check (status in ('queued','running','passed','failed','error','cancelled')),
  started_by       text,                           -- admin email, or 'schedule'
  github_run_url   text,
  passed           integer not null default 0,
  failed           integer not null default 0,
  skipped          integer not null default 0,
  error            text,                           -- runner-level failure
  created_at       timestamptz not null default now(),
  started_at       timestamptz,
  finished_at      timestamptz
);
create index vw_qa_runs_product_created_idx on public.vw_qa_runs (product_slug, created_at desc);

create table public.vw_qa_results (
  id               uuid primary key default gen_random_uuid(),
  run_id           uuid not null references public.vw_qa_runs(id) on delete cascade,
  test_id          text not null,
  status           text not null check (status in ('passed','failed','skipped','timed_out','flaky')),
  attempt          integer not null default 1,
  duration_ms      integer,
  error_message    text,
  error_step       text,
  screenshot_path  text,                           -- paths in the vw-qa-artifacts bucket
  trace_path       text,
  video_path       text,
  created_at       timestamptz not null default now(),
  unique (run_id, test_id, attempt)
);
create index vw_qa_results_test_idx on public.vw_qa_results (test_id, created_at desc);

create table public.vw_qa_manual_checks (
  id               uuid primary key default gen_random_uuid(),
  test_id          text not null references public.vw_qa_tests(id) on delete cascade,
  run_id           uuid references public.vw_qa_runs(id) on delete set null,
  status           text not null check (status in ('passed','failed','skipped')),
  note             text,
  checked_by       text,
  created_at       timestamptz not null default now()
);

alter table public.vw_qa_products      enable row level security;
alter table public.vw_qa_tests         enable row level security;
alter table public.vw_qa_runs          enable row level security;
alter table public.vw_qa_results       enable row level security;
alter table public.vw_qa_manual_checks enable row level security;

-- Private bucket for failure screenshots, traces and videos (server-only; the
-- admin UI hands out short-lived signed links).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vw-qa-artifacts', 'vw-qa-artifacts', false, 52428800,
        array['image/png','video/webm','application/zip'])
on conflict (id) do nothing;

insert into public.vw_qa_products (slug, name, base_url)
values ('visionworkx', 'VisionWorkx', 'https://modules.revalorllc.com')
on conflict (slug) do nothing;
