-- AI quiz leads: sign-ups from products.revalorllc.com/ai-quiz, written
-- server-side by revalor-products' /api/ai-quiz route. One row per person
-- (unique email); a retake updates the answers but doesn't restart the emails.
--
-- Access: RLS on with NO policies on purpose, same as vw_waitlist. Browsers
-- (anon/authenticated) can neither read nor write. Only service-role server
-- code can: revalor-products (insert/update, nurture cron) and, later,
-- revalor-admin (read-only Leads dashboard).
--
-- Purely additive: touches no existing table.
create table if not exists public.vw_ai_quiz_leads (
  id                 uuid primary key default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  -- Contact + consent
  first_name         text not null check (char_length(first_name) between 1 and 80),
  email              text not null check (char_length(email) between 3 and 254),
  consented_at       timestamptz not null,
  source             text not null default 'direct' check (char_length(source) <= 60),

  -- Answers (codes must match lib/aiQuiz.ts in revalor-products)
  q1_frequency       text not null check (q1_frequency in ('daily','weekly','tried','never')),
  q2_use             text not null check (q2_use in ('personal','job','small_business','large_business')),
  q3_frustration     text not null check (q3_frustration in
                       ('what_to_ask','vague','made_up','privacy','too_many_tools','not_fit_work')),
  q4_used_for        text[] not null default '{}' check (q4_used_for <@ array[
                       'emails','summaries','research','brainstorming','planning',
                       'data_code','images_video','nothing']::text[]),
  q5_prompt_style    text not null check (q5_prompt_style in ('quick','sentence','structured','saved')),
  q6_caught_wrong    text not null check (q6_caught_wrong in ('yes_check','yes_once','not_sure','no')),
  q7_repetitive_task text check (char_length(q7_repetitive_task) <= 500),
  wants_call         boolean not null default false,

  -- Derived
  is_business_owner  boolean generated always as (q2_use in ('small_business','large_business')) stored,
  score              smallint not null check (score between 0 and 8),
  level              text not null check (level in ('explorer','builder','power_user')),

  -- Email activity
  guides_sent_at     timestamptz,                        -- Email 1
  nurture_step       smallint not null default 0 check (nurture_step between 0 and 4),
  next_email_at      timestamptz,                        -- null = nothing scheduled
  call_alert_sent_at timestamptz,                        -- alert to info@revalorllc.com
  call_booked_at     timestamptz,                        -- stops the sequence
  unsubscribed_at    timestamptz,                        -- stops everything

  -- Only business owners see the call box
  constraint vw_ai_quiz_leads_call_needs_business
    check (not wants_call or q2_use in ('small_business','large_business')),
  -- Level must match the scoring bands (0-3 / 4-6 / 7-8)
  constraint vw_ai_quiz_leads_level_matches_score
    check ((level = 'explorer'   and score between 0 and 3)
        or (level = 'builder'    and score between 4 and 6)
        or (level = 'power_user' and score between 7 and 8))
);

create unique index if not exists vw_ai_quiz_leads_email_key
  on public.vw_ai_quiz_leads (lower(email));
create index if not exists vw_ai_quiz_leads_created_at_idx
  on public.vw_ai_quiz_leads (created_at desc);
-- The daily nurture job looks up who's due next
create index if not exists vw_ai_quiz_leads_due_idx
  on public.vw_ai_quiz_leads (next_email_at)
  where next_email_at is not null and unsubscribed_at is null and call_booked_at is null;

alter table public.vw_ai_quiz_leads enable row level security;
-- No policies: service-role only (see header).
