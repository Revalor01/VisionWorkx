-- =============================================================
-- Vision Workx — Partnership Program Phase 1 (Migration 19)
-- =============================================================
--
-- Public partnership application intake + deterministic qualification
-- scoring + tier assignment + admin approve/deny. Follows the `leads`
-- access pattern (migration 12): RLS enabled with NO policies —
-- default-deny for anon/authenticated — all reads/writes go through
-- service-role API routes. Unlike `leads` this table IS written to by
-- an unauthenticated, public-facing route (app/api/partners/apply),
-- but that route uses the service-role client itself rather than an
-- anon INSERT policy, so untrusted callers can never write a row (or
-- a forged score/tier) directly via the Supabase REST API.
--
-- Phase 2 (not built here) will add: required promotional actions /
-- referral expectations / scope limitations per tier, agreement
-- generation, partner dashboard, referral tracking, project scope
-- templates, payment logic. The `tier` + `discount_percentage`
-- columns exist now so Phase 2 doesn't need a migration just to know
-- what tier a partner landed in.

create table public.partner_applications (
  id                      uuid primary key default gen_random_uuid(),

  -- Identity / contact
  business_name           text not null,
  owner_name              text not null,
  email                   text not null,
  phone                   text not null,

  -- Qualification inputs — all closed dropdown/checkbox sets so
  -- scoring (lib/partners/scoring.ts) is deterministic and reproducible.
  industry                text not null
                            constraint partner_applications_industry_check
                            check (industry in (
                              'health_wellness', 'home_services_trades', 'food_beverage',
                              'fitness', 'professional_services', 'automotive', 'retail', 'other'
                            )),
  services_offered        text[] not null default '{}'
                            constraint partner_applications_services_offered_check
                            check (cardinality(services_offered) > 0),
  services_offered_other  text,                    -- free text, display-only, not scored
  online_presence_url     text,                    -- null/empty = "none"
  budget_range            text not null
                            constraint partner_applications_budget_range_check
                            check (budget_range in ('under_500', '500_1500', '1500_5000', '5000_plus')),
  social_reach_range      text not null
                            constraint partner_applications_social_reach_check
                            check (social_reach_range in ('under_500', '500_2500', '2500_10000', '10000_50000', '50000_plus')),
  referral_network_size   text not null
                            constraint partner_applications_referral_network_check
                            check (referral_network_size in ('0_5', '6_15', '16_40', '41_plus')),
  why_partner             text not null,           -- free text, admin reads manually

  -- Uploads — service-role uploaded to the `partner-uploads` bucket;
  -- paths, not URLs, since the bucket is public (UI builds the public
  -- URL from the path, same approach as the `logos` bucket).
  logo_path               text,
  photo_paths             text[] not null default '{}',

  -- Scoring — see lib/partners/scoring.ts for the formula, computed
  -- server-side at submission time and never trusted from the client.
  -- score_breakdown mirrors leads.signal_breakdown: an auditable
  -- array of {dimension, points, detail}, not just a bare total.
  score_breakdown         jsonb not null default '[]'::jsonb,
  total_score             integer not null default 0,

  -- Tier decision — Phase 1 stores just tier + discount; the rest of
  -- what a tier means (required actions, scope limits) is Phase 2.
  tier                    text
                            constraint partner_applications_tier_check
                            check (tier in ('tier_1', 'tier_2', 'tier_3')),
  discount_percentage     numeric(5,2),

  -- Approval workflow — Phase 1 stops at approve/deny, no
  -- agreement/sign-off step yet.
  status                  text not null default 'pending'
                            constraint partner_applications_status_check
                            check (status in ('pending', 'approved', 'denied')),
  admin_notes             text,
  reviewed_by             text,          -- admin email; no separate admin-users table exists
  reviewed_at             timestamptz,

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index partner_applications_status_idx     on public.partner_applications(status);
create index partner_applications_tier_idx       on public.partner_applications(tier);
create index partner_applications_total_score_idx on public.partner_applications(total_score desc);
create index partner_applications_created_at_idx on public.partner_applications(created_at desc);

alter table public.partner_applications enable row level security;
-- No policies — default-deny for anon/authenticated. Only the
-- service-role client (app/api/partners/apply, app/api/admin/partners/*)
-- can read/write. Same model as public.leads.

-- ---------------------------------------------------------------
-- STORAGE: partner-uploads bucket (public read, service-role-only write)
-- ---------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'partner-uploads',
  'partner-uploads',
  true, -- public read: admin dashboard renders thumbnails via plain public
        -- URLs, same tradeoff as the `logos` bucket (migration 11)
  8388608, -- 8 MB
  array['image/png', 'image/jpeg', 'image/webp']
);

-- Public read only. Deliberately NO insert/update/delete policy for
-- anon or authenticated — this is a public, unauthenticated intake
-- flow, so allowing direct client uploads would be an open write
-- endpoint with no server-side validation in between. All uploads
-- happen server-side via the service-role client inside
-- app/api/partners/apply/route.ts, which bypasses RLS entirely and
-- needs no policy to write.
create policy "partner-uploads: public read"
  on storage.objects for select
  to public
  using (bucket_id = 'partner-uploads');
