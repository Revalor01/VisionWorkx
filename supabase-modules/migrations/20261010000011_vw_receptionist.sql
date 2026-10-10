-- AI receptionist (chat + voice) for VisionWorkx modules. Additive, except two
-- check constraints widened in place (same drop-if-exists/add pattern as
-- 20260926000005_vw_plans_billing and 20260926000006_vw_self_serve). The drops
-- were explicitly OK'd; each is immediately replaced by a wider check, so all
-- existing rows stay valid.
--
-- Access model (plain English):
--   * Business logins (owners and staff) can READ their own workspace's
--     receptionist conversations, transcripts, phone number, calls and usage —
--     never another workspace's.
--   * Nobody signed in can write to these tables. Every write goes through the
--     VisionWorkx server (service role), same as submissions.
--   * Some columns are hidden even from the owner: the chat visitor's token
--     hash, AI token/cost columns, and the voice provider's agent id.
--   * Website visitors and callers never touch the database directly.
--   * The usage counter only changes through vw_receptionist_add_usage(),
--     which adds atomically so two calls can't race past the cap.

-- 1. Allow the new module type.
alter table public.vw_modules drop constraint if exists vw_modules_type_check;
alter table public.vw_modules add constraint vw_modules_type_check
  check (type in ('lead_capture','booking','quote_calculator','intake_form','receptionist'));

-- 2. New usage-alert kinds.
alter table public.vw_usage_alerts drop constraint if exists vw_usage_alerts_kind_check;
alter table public.vw_usage_alerts add constraint vw_usage_alerts_kind_check check (kind in (
  'submissions_80','submissions_100','submissions_150','emails_100','storage_100',
  'welcome','install_nudge','install_request',
  'chats_80','chats_100','chats_150','voice_80','voice_100'
));

-- 3. Conversations (one per chat session or phone call).
create table public.vw_receptionist_conversations (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.vw_workspaces(id) on delete cascade,
  module_id      uuid not null references public.vw_modules(id) on delete cascade,
  channel        text not null check (channel in ('chat','voice')),
  visitor_hash   text,                       -- sha256 of the chat visitor token (chat only)
  submission_id  uuid references public.vw_submissions(id) on delete set null,
  message_count  integer not null default 0,
  tokens_in      integer not null default 0,
  tokens_out     integer not null default 0,
  cost_usd       numeric(10,4) not null default 0,
  started_at     timestamptz not null default now(),
  last_at        timestamptz not null default now()
);
create index vw_receptionist_conv_ws_idx on public.vw_receptionist_conversations (workspace_id, started_at desc);

create table public.vw_receptionist_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.vw_receptionist_conversations(id) on delete cascade,
  workspace_id    uuid not null references public.vw_workspaces(id) on delete cascade,
  role            text not null check (role in ('visitor','assistant')),
  content         text not null check (char_length(content) <= 4000),
  created_at      timestamptz not null default now()
);
create index vw_receptionist_msg_conv_idx on public.vw_receptionist_messages (conversation_id, created_at);

-- 4. Phone numbers (max one active per workspace).
create table public.vw_receptionist_numbers (
  id                 uuid primary key default gen_random_uuid(),
  workspace_id       uuid not null references public.vw_workspaces(id) on delete cascade,
  module_id          uuid not null references public.vw_modules(id) on delete cascade,
  phone_e164         text not null check (phone_e164 ~ '^\+1[0-9]{10}$'),
  provider           text not null default 'retell' check (provider in ('retell')),
  provider_agent_id  text,
  status             text not null default 'active' check (status in ('active','released')),
  created_at         timestamptz not null default now(),
  released_at        timestamptz
);
create unique index vw_receptionist_numbers_active_ws on public.vw_receptionist_numbers (workspace_id) where status = 'active';
create unique index vw_receptionist_numbers_phone on public.vw_receptionist_numbers (phone_e164) where status = 'active';

-- 5. Calls.
create table public.vw_receptionist_calls (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references public.vw_workspaces(id) on delete cascade,
  conversation_id   uuid references public.vw_receptionist_conversations(id) on delete set null,
  provider_call_id  text not null unique,
  from_number       text check (from_number is null or char_length(from_number) <= 20),
  duration_seconds  integer not null default 0,
  cost_usd          numeric(10,4) not null default 0,
  outcome           text check (outcome in ('booked','message','transferred','answered','abandoned')),
  summary           text check (summary is null or char_length(summary) <= 2000),
  started_at        timestamptz not null default now(),
  ended_at          timestamptz
);
create index vw_receptionist_calls_ws_idx on public.vw_receptionist_calls (workspace_id, started_at desc);

-- 6. Monthly usage counters + an atomic add that enforces the voice cap.
create table public.vw_receptionist_usage (
  workspace_id   uuid not null references public.vw_workspaces(id) on delete cascade,
  period         text not null check (period ~ '^[0-9]{4}-[0-9]{2}$'),
  chats          integer not null default 0,
  voice_seconds  integer not null default 0,
  primary key (workspace_id, period)
);

create or replace function public.vw_receptionist_add_usage(
  p_workspace uuid, p_period text, p_chats integer, p_voice_seconds integer)
returns table (chats integer, voice_seconds integer)
language sql security definer set search_path = public as $$
  insert into public.vw_receptionist_usage as u (workspace_id, period, chats, voice_seconds)
  values (p_workspace, p_period, greatest(p_chats,0), greatest(p_voice_seconds,0))
  on conflict (workspace_id, period) do update
    set chats = u.chats + greatest(p_chats,0),
        voice_seconds = u.voice_seconds + greatest(p_voice_seconds,0)
  returning u.chats, u.voice_seconds;
$$;
revoke all on function public.vw_receptionist_add_usage(uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.vw_receptionist_add_usage(uuid, text, integer, integer) to service_role;

-- 7. Row Level Security.
alter table public.vw_receptionist_conversations enable row level security;
alter table public.vw_receptionist_messages      enable row level security;
alter table public.vw_receptionist_numbers       enable row level security;
alter table public.vw_receptionist_calls         enable row level security;
alter table public.vw_receptionist_usage         enable row level security;

create policy "members read own receptionist conversations" on public.vw_receptionist_conversations
  for select to authenticated using (public.vw_is_member(workspace_id));
create policy "members read own receptionist messages" on public.vw_receptionist_messages
  for select to authenticated using (public.vw_is_member(workspace_id));
create policy "members read own receptionist numbers" on public.vw_receptionist_numbers
  for select to authenticated using (public.vw_is_member(workspace_id));
create policy "members read own receptionist calls" on public.vw_receptionist_calls
  for select to authenticated using (public.vw_is_member(workspace_id));
create policy "members read own receptionist usage" on public.vw_receptionist_usage
  for select to authenticated using (public.vw_is_member(workspace_id));

revoke insert, update, delete on public.vw_receptionist_conversations, public.vw_receptionist_messages,
  public.vw_receptionist_numbers, public.vw_receptionist_calls, public.vw_receptionist_usage from anon, authenticated;
revoke all on public.vw_receptionist_conversations, public.vw_receptionist_messages,
  public.vw_receptionist_numbers, public.vw_receptionist_calls, public.vw_receptionist_usage from anon;
-- Hide visitor_hash, token/cost columns and provider_agent_id from client logins (column-level read).
revoke select on public.vw_receptionist_conversations, public.vw_receptionist_numbers from authenticated;
grant select (id, workspace_id, module_id, channel, submission_id, message_count, started_at, last_at)
  on public.vw_receptionist_conversations to authenticated;
grant select (id, workspace_id, module_id, phone_e164, status, created_at, released_at)
  on public.vw_receptionist_numbers to authenticated;
