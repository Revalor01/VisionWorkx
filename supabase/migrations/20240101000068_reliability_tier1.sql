-- First-build reliability, tier 1.

-- Cron-updated health flags with change-only alerting (see
-- /api/cron/anthropic-health).
create table if not exists public.system_health (
  key text primary key,
  ok boolean not null,
  detail text,
  updated_at timestamptz not null default now()
);

comment on table public.system_health is
  'Cron health flags (e.g. anthropic_api). Alerts fire only on state change.';

-- (apps.failure_reason added in 20240101000067)
