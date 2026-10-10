-- Follow-up to 20261010000011_vw_receptionist (already applied): hide the
-- per-call AI cost from client logins, as that migration's header promised.
-- vw_receptionist_calls only had insert/update/delete revoked, so members could
-- still read every column (including cost_usd) of their own workspace's calls.
--
-- Access (plain English): unchanged rows — members still read only their own
-- workspace's calls (the existing RLS policy) — but now only these columns;
-- cost_usd stays server-only. No data or columns are changed or removed.

revoke select on public.vw_receptionist_calls from authenticated;
grant select (id, workspace_id, conversation_id, provider_call_id, from_number,
              duration_seconds, outcome, summary, started_at, ended_at)
  on public.vw_receptionist_calls to authenticated;
