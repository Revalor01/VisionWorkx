-- =============================================================
-- Vision Workx — Lifecycle Email Triggers (Migration 44)
-- =============================================================
--
-- Event-driven email (welcome, activation nudge, inactivity win-back,
-- milestones) driven by a cron scan against each product's auth.users,
-- not real event ingestion — see lib/lifecycle/triggers.ts's comment for
-- why. Reuses marketing_campaigns for logging (one row per trigger firing,
-- possibly to many recipients at once) rather than a parallel log table.

-- A lifecycle firing targets specific qualifying users, not "the whole
-- product audience" the way a scheduled/recurring campaign does — nullable
-- so every existing send path (scheduled, recurring, manual) is unaffected
-- and keeps sending to the full audience.
alter table public.marketing_campaigns
  add column target_emails text[];

-- Admin-mutable on/off + autonomy per trigger. The trigger's identity,
-- target products, and matching condition live in code
-- (lib/lifecycle/triggers.ts) since they aren't meaningfully editable from
-- a dashboard; this table is just the toggle state layered on top.
create table public.lifecycle_trigger_settings (
  trigger_id   text primary key,
  active       boolean not null default true,
  autonomy     text not null default 'manual'
                 constraint lifecycle_trigger_settings_autonomy_check check (autonomy in ('manual', 'auto')),
  updated_at   timestamptz not null default now()
);

insert into public.lifecycle_trigger_settings (trigger_id) values
  ('welcome'), ('activation_nudge'), ('win_back_30'), ('win_back_60'), ('win_back_90'), ('vw_first_deploy');

-- Dedupe ledger — the unique constraint is what makes "no user gets the
-- same lifecycle email twice for one qualifying event" actually true even
-- under a cron run overlapping the previous one, not just "true in the
-- common case." The cron inserts a row here before generating/sending;
-- a unique violation means another run already claimed that
-- trigger+product+recipient, so this run skips it.
create table public.lifecycle_fires (
  id               uuid primary key default gen_random_uuid(),
  trigger_id       text not null,
  product          text not null
                     constraint lifecycle_fires_product_check
                     check (product in ('visionworkx', 'chorebit', 'feelflow', 'mindbit', 'sanctum')),
  recipient_email  text not null,
  campaign_id      uuid references public.marketing_campaigns(id) on delete set null,
  created_at       timestamptz not null default now(),
  unique (trigger_id, product, recipient_email)
);

create index lifecycle_fires_trigger_idx on public.lifecycle_fires(trigger_id, created_at desc);

alter table public.lifecycle_trigger_settings enable row level security;
alter table public.lifecycle_fires enable row level security;
-- No policies — default-deny, same as every other marketing table. Only
-- the service-role client (admin API routes + the lifecycle cron) touches these.
