-- Why a build failed, for the /generate failure screen and ops triage.
-- Values: 'anthropic_credits' | 'anthropic_overloaded' | 'timeout' |
-- 'build_error' | 'generation' | null (never failed / cleared on retry).
alter table public.apps
  add column if not exists failure_reason text;

comment on column public.apps.failure_reason is
  'Classification of the last build failure (anthropic_credits, timeout, build_error, generation, ...). Null when the app has not failed.';
