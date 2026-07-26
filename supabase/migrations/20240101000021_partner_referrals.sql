-- =============================================================
-- Vision Workx — Partnership Program Phase 3 (Migration 21)
-- =============================================================
--
-- Referral tracking + branding-requirement checklist on top of the
-- Phase 1/2 partner_applications table (migrations 19-20).
--
-- referral_code is generated once at agreement acceptance
-- (app/api/partners/agreement/accept/route.ts) — an attribution label
-- shown to the partner and admin, not a working public /refer/<code>
-- link (that would be a separate public-facing flow, out of scope).
--
-- converted_referral_count + referral_bonus_discount_percentage are
-- an ADDITIVE bonus on top of the immutable agreement's
-- discount_percentage, recalculated whenever admin changes a
-- referral's status (lib/partners/referrals.ts). This deliberately
-- does not touch tier/discount_percentage/agreement_terms — bumping
-- the actual tier would invalidate the immutable Phase 2 agreement
-- snapshot (wrong promotional-action list, wrong scope text) and
-- require a re-acceptance flow that's out of scope here.
--
-- completed_promotional_actions is a partner self-report checklist
-- against agreement_terms.requiredPromotionalActions — there's no
-- realistic way to verify a badge is actually live on someone's site
-- or a social post actually happened, so this tracks what the
-- partner says they've done, visible to admin, not policed.

alter table public.partner_applications
  add column referral_code                      text unique,
  add column completed_promotional_actions       text[] not null default '{}',
  add column converted_referral_count            integer not null default 0,
  add column referral_bonus_discount_percentage  numeric(5,2) not null default 0;

create table public.partner_referrals (
  id                      uuid primary key default gen_random_uuid(),
  partner_application_id  uuid not null references public.partner_applications(id) on delete cascade,
  referred_business_name  text not null,
  referred_contact_name   text,
  referred_email          text,
  referred_phone          text,
  notes                   text,
  status                  text not null default 'submitted'
                            constraint partner_referrals_status_check
                            check (status in ('submitted', 'contacted', 'converted', 'declined')),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index partner_referrals_partner_application_id_idx on public.partner_referrals(partner_application_id);
create index partner_referrals_status_idx on public.partner_referrals(status);

alter table public.partner_referrals enable row level security;
-- No policies — default-deny, same pattern as partner_applications. Only
-- the service-role client (from authenticated server routes/pages that
-- have already verified identity) reads/writes this table.
