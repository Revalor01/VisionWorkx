-- =============================================================
-- Vision Workx — Partnership Program Phase 2 (Migration 20)
-- =============================================================
--
-- Adds agreement generation + partner account linking on top of the
-- Phase 1 intake/scoring/approval table (migration 19). Agreement
-- terms are generated once at approval time (lib/partners/agreement.ts)
-- and stored as a jsonb snapshot rather than computed live, so a
-- partner's agreement stays exactly as they saw it even if the
-- tier boilerplate text changes later.
--
-- account_user_id links this application to the real auth.users
-- account the partner creates/logs into (matched by email, see
-- app/partner/page.tsx) — kept separate from profiles.plan, which is
-- a free/starter/growth/pro CHECK constraint for the unrelated
-- customer subscription product.

alter table public.partner_applications
  add column account_user_id        uuid references auth.users(id) on delete set null,
  add column agreement_terms        jsonb,
  add column agreement_generated_at timestamptz,
  add column agreement_accepted_at  timestamptz;

create index partner_applications_account_user_id_idx on public.partner_applications(account_user_id);
