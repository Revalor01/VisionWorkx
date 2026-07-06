-- =============================================================
-- Vision Workx — automations_reader: read access to apps (Migration 9)
-- =============================================================
--
-- Lets the Revalor Automations poller enrich outbox events with app
-- metadata (category, name, status) beyond what's already captured in
-- automation_events.row_data — e.g. to map "a row changed in a booking
-- category app" to a semantic trigger type.
--
-- The existing RLS policies on public.apps are scoped to
-- `auth.uid() = user_id`, which is null for this role (it connects
-- directly, not through a Supabase Auth session) — so a table GRANT
-- alone would still return zero rows. A dedicated policy is required.

grant select on public.apps to automations_reader;

create policy "automations_reader: select all apps"
  on public.apps for select
  to automations_reader
  using (true);
