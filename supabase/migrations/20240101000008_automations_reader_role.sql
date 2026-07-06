-- =============================================================
-- Vision Workx — Automations Reader Role (Migration 8)
-- =============================================================
--
-- Dedicated Postgres role for the Revalor Automations service to read
-- the automation_events outbox and mark events delivered. Deliberately
-- scoped to exactly that:
--
--   * No access to any tenant (app_xxxxxxxx) schema. row_data /
--     old_row_data on each event already carries a full snapshot of
--     the changed row, which covers this role's read needs — it
--     doesn't need to reach into tenant tables directly.
--   * Column-restricted UPDATE — this role can flip delivered_at and
--     nothing else on automation_events. It cannot alter app_id,
--     row_data, or any other column.
--   * No LOGIN / PASSWORD here on purpose — credentials are set
--     out-of-band (ALTER ROLE ... WITH LOGIN PASSWORD ...) so a
--     secret never enters migration history or version control.
--     Until that ALTER runs, this role exists but cannot connect.
--
-- Write-back into tenant data (e.g. marking "reminder_sent = true" on
-- a customer's own booking row) is a separate concern for a later,
-- narrowly-scoped credential — not bundled into this reader role.

create role automations_reader nologin;

grant usage on schema public to automations_reader;

grant select on public.automation_events to automations_reader;
grant update (delivered_at) on public.automation_events to automations_reader;

create policy "automations_reader: select all events"
  on public.automation_events for select
  to automations_reader
  using (true);

create policy "automations_reader: update delivered_at only"
  on public.automation_events for update
  to automations_reader
  using (true)
  with check (true);
