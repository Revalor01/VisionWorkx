-- Migration 34 created social_autonomy_flags without RLS, so anyone holding
-- the public anon key could read, edit and delete it (Supabase security
-- advisor: rls_disabled_in_public, 2026-10-17). Already applied live
-- 2026-10-20.
--
-- Access: RLS on with NO policies on purpose — anon/authenticated clients can
-- neither read nor write. Only service-role server code can:
-- lib/social/autonomyFlags.ts (insert) and revalor-admin lib/socialAlerts.ts
-- (read/resolve) via its VisionWorkx service-role client.
alter table public.social_autonomy_flags enable row level security;
