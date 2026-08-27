-- =============================================================
-- Vision Workx — Mobile Marketing: push + SMS (Migration 45)
-- =============================================================
--
-- Project 04 orientation finding: no product persists a push token or a
-- phone number for its own end users anywhere this admin can reach (see
-- lib/mobile/audience.ts's comment) — so there's no audience table to add
-- here yet. What this migration adds is what's real today: a `channel` on
-- the existing scheduling tables (so Project 02's scheduling/recurrence
-- infra can carry push/SMS campaigns, not just email) and the SMS
-- opt-out ledger, which is genuinely functional infrastructure the moment
-- any real SMS goes out, independent of where phone numbers end up
-- coming from.
--
-- Written to be safely re-runnable (IF NOT EXISTS / exception-guarded
-- constraints) since an earlier partial run already created some of this.

alter table public.marketing_campaigns
  add column if not exists channel text not null default 'email';

do $$ begin
  alter table public.marketing_campaigns
    add constraint marketing_campaigns_channel_check check (channel in ('email', 'push', 'sms'));
exception when duplicate_object then null;
end $$;

alter table public.marketing_recurring_schedules
  add column if not exists channel text not null default 'email';

do $$ begin
  alter table public.marketing_recurring_schedules
    add constraint marketing_recurring_schedules_channel_check check (channel in ('email', 'push', 'sms'));
exception when duplicate_object then null;
end $$;

-- Global by phone number, not per-product — unlike email's per-product
-- unsubscribe (migration 29), a "STOP" reply to any Revalor text should
-- stop all Revalor texts to that number. That's how a shared sending
-- number actually works under carrier/TCPA rules: the opt-out is with the
-- number that sent it, not with one brand behind it.
create table if not exists public.mobile_sms_opt_outs (
  id            uuid primary key default gen_random_uuid(),
  phone         text not null unique,
  opted_out_at  timestamptz not null default now(),
  source        text not null default 'reply_stop'
);

do $$ begin
  alter table public.mobile_sms_opt_outs
    add constraint mobile_sms_opt_outs_source_check check (source in ('reply_stop', 'manual'));
exception when duplicate_object then null;
end $$;

alter table public.mobile_sms_opt_outs enable row level security;
-- No policies — default-deny. Written by the Twilio inbound webhook
-- (service-role client, signature-verified) and read by the SMS audience
-- resolver once one exists.
