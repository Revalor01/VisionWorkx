-- AI quiz tips: which tip each lead got last, so a tip is never sent twice
-- and sends stay at most twice a month. Written by revalor-products'
-- /api/admin/ai-quiz-tip route (service role). Purely additive; RLS unchanged.
alter table public.vw_ai_quiz_leads
  add column if not exists last_tip_id      text check (char_length(last_tip_id) <= 40),
  add column if not exists last_tip_sent_at timestamptz;
