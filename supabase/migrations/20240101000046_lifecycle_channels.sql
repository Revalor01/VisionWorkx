-- =============================================================
-- Vision Workx — Lifecycle triggers gain push/SMS (Migration 46)
-- =============================================================
--
-- Project 04 wires push/SMS variants of Project 03's lifecycle triggers
-- against the same engine. lifecycle_fires' dedupe key needs a channel
-- dimension so "win_back_30 email" and "win_back_30 push" for the same
-- user dedupe independently, and the recipient column needs a channel-
-- neutral name — it held an email address only because email was the
-- only channel that existed yet, not because dedupe is inherently
-- email-shaped.

alter table public.lifecycle_fires rename column recipient_email to recipient;

alter table public.lifecycle_fires
  add column channel text not null default 'email'
    constraint lifecycle_fires_channel_check check (channel in ('email', 'push', 'sms'));

-- Drop whatever the original 3-column unique constraint from migration 44
-- got auto-named (rather than guess the exact name) and replace it with
-- the 4-column version.
do $$
declare
  c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.lifecycle_fires'::regclass
      and contype = 'u'
  loop
    execute format('alter table public.lifecycle_fires drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.lifecycle_fires
  add constraint lifecycle_fires_trigger_product_channel_recipient_key
  unique (trigger_id, product, channel, recipient);
