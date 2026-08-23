-- Tracks $ spent on direct Anthropic API calls across the whole Revalor
-- ecosystem (blog, social, marketing, outreach, app-generation) — none of
-- these go through Vercel's AI Gateway (only image/video gen does, see
-- lib/social/gatewaySpend.ts), so there was previously no spend visibility
-- into actual Claude usage at all. cost_usd is computed and stored at
-- insert time from a rate table (lib/aiUsage.ts) so a future price change
-- doesn't silently rewrite historical cost.
create table public.ai_usage_log (
  id            uuid primary key default gen_random_uuid(),
  source        text not null,
  model         text not null,
  input_tokens  integer not null,
  output_tokens integer not null,
  cost_usd      numeric,
  created_at    timestamptz not null default now()
);

create index ai_usage_log_created_at_idx on public.ai_usage_log(created_at desc);
create index ai_usage_log_source_idx on public.ai_usage_log(source);

alter table public.ai_usage_log enable row level security;
