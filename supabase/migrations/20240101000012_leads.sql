-- =============================================================
-- Vision Workx — Lead Finder (Migration 12)
-- =============================================================
--
-- Internal sales tooling: discovered businesses scored against the
-- VisionWorkx lead-signal formula (see reference/visionworkx_lead_signals.html
-- in the revalor-automation repo). Admin-only — no customer ever sees
-- this. Follows the same access pattern as apps/profiles/subscriptions:
-- RLS enabled with no policies (default-deny for anon/authenticated),
-- accessed exclusively via the service-role client from /admin after
-- the existing ADMIN_EMAIL check in app/admin/page.tsx.

create table public.leads (
  id                   uuid primary key default gen_random_uuid(),
  source               text not null default 'osm',
  source_id            text not null,
  business_name        text not null,
  business_type        text,
  industry_category    text,
  address              text,
  lat                  double precision,
  lng                  double precision,
  phone                text,
  email                text,
  website              text,
  has_facebook_only    boolean not null default false,
  opening_hours        text,
  raw_score            integer not null default 0,
  industry_multiplier  numeric(3,2) not null default 1.0,
  final_score          integer not null default 0,
  signal_breakdown     jsonb not null default '[]'::jsonb,
  status               text not null default 'new'
                         constraint leads_status_check
                         check (status in ('new', 'contacted', 'responded', 'qualified', 'converted', 'dead')),
  discovered_at        timestamptz not null default now(),
  last_contacted_at    timestamptz,
  notes                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (source, source_id)
);

create index leads_final_score_idx on public.leads(final_score desc);
create index leads_status_idx on public.leads(status);
create index leads_industry_category_idx on public.leads(industry_category);
create index leads_discovered_at_idx on public.leads(discovered_at desc);

alter table public.leads enable row level security;
-- No policies — default-deny. Only the service-role client (used from
-- the admin-gated API routes) can read/write this table.

-- Time-series outreach log — separate from leads.status so history
-- isn't lost every time status changes, and so score-vs-outcome can
-- actually be analyzed later (the whole point of persisting this at
-- all instead of a one-off spreadsheet).
create table public.lead_events (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null references public.leads(id) on delete cascade,
  event_type  text not null,
  notes       text,
  created_at  timestamptz not null default now()
);

create index lead_events_lead_id_idx on public.lead_events(lead_id);

alter table public.lead_events enable row level security;
-- Same access model as leads — service-role only.
