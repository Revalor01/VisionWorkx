-- =============================================================
-- Vision Workx — Email Marketing Campaigns (Migration 29)
-- =============================================================
--
-- Lets Revalor send email campaigns to the real end-users of its own
-- products (VisionWorkx, Chorebit, FeelFlow, MindBit) — re-engagement,
-- feature announcements, digests. Distinct from `leads` (migration 12),
-- which is B2B sales outreach to prospective VisionWorkx customers, not
-- marketing to existing product users.
--
-- Admin-only, same access pattern as leads/social tables: RLS enabled
-- with no policies (default-deny for anon/authenticated), accessed
-- exclusively via the service-role client from /admin/marketing's
-- admin-gated API routes.

create table public.marketing_campaigns (
  id               uuid primary key default gen_random_uuid(),
  product          text not null
                     constraint marketing_campaigns_product_check
                     check (product in ('visionworkx', 'chorebit', 'feelflow', 'mindbit')),
  subject          text not null,
  body_html        text not null,
  status           text not null default 'draft'
                     constraint marketing_campaigns_status_check
                     check (status in ('draft', 'sending', 'sent', 'failed')),
  recipient_count  integer not null default 0,
  sent_count       integer not null default 0,
  failed_count     integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  sent_at          timestamptz
);

create index marketing_campaigns_product_idx on public.marketing_campaigns(product);
create index marketing_campaigns_status_idx on public.marketing_campaigns(status);
create index marketing_campaigns_created_at_idx on public.marketing_campaigns(created_at desc);

alter table public.marketing_campaigns enable row level security;
-- No policies — default-deny. Only the service-role client (used from
-- the admin-gated API routes) can read/write this table.

-- Per-product unsubscribe record — required for commercial email
-- (CAN-SPAM). A signed link in every campaign's footer inserts a row
-- here via a public (non-admin) route; getSendableAudience() in
-- lib/marketing/audience.ts filters these out before every send.
-- Scoped per-product rather than globally: unsubscribing from Chorebit
-- updates shouldn't silently opt someone out of a MindBit account they
-- separately hold under the same email.
create table public.marketing_unsubscribes (
  id                uuid primary key default gen_random_uuid(),
  product           text not null
                      constraint marketing_unsubscribes_product_check
                      check (product in ('visionworkx', 'chorebit', 'feelflow', 'mindbit')),
  email             text not null,
  unsubscribed_at   timestamptz not null default now(),
  unique (product, email)
);

create index marketing_unsubscribes_product_email_idx on public.marketing_unsubscribes(product, email);

alter table public.marketing_unsubscribes enable row level security;
-- No policies — default-deny for anon/authenticated. Written only via
-- the service-role client, from the public unsubscribe route (which
-- verifies a signed token before inserting, not RLS).
