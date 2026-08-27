-- =============================================================
-- Vision Workx — SMS opt-in (Migration 48)
-- =============================================================
--
-- The real, user-facing consent record Twilio's Toll-Free Verification
-- requires evidence of (a screenshot of the opt-in flow this table backs) —
-- lib/mobile/audience.ts's getSmsAudience("visionworkx") had nothing to
-- query until this existed. Unlike every other table this session added,
-- this one is written directly by the end user (RLS-gated, not
-- service-role-only) — it's their own consent record, not admin data.

create table public.sms_opt_ins (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade unique,
  phone         text not null,
  consented_at  timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.sms_opt_ins enable row level security;

create policy "select own sms opt-in"
  on public.sms_opt_ins for select
  using (auth.uid() = user_id);

create policy "insert own sms opt-in"
  on public.sms_opt_ins for insert
  with check (auth.uid() = user_id);

create policy "update own sms opt-in"
  on public.sms_opt_ins for update
  using (auth.uid() = user_id);

create policy "delete own sms opt-in"
  on public.sms_opt_ins for delete
  using (auth.uid() = user_id);
