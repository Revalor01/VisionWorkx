-- =============================================================
-- Vision Workx — Initial Schema
-- =============================================================

-- ---------------------------------------------------------------
-- TABLES
-- ---------------------------------------------------------------

-- Profiles (extends auth.users — one row per authenticated user)
create table public.profiles (
  id             uuid references auth.users(id) on delete cascade primary key,
  full_name      text,
  company_name   text,
  plan           text not null default 'free'
                   constraint profiles_plan_check
                   check (plan in ('free', 'starter', 'growth', 'pro')),
  created_at     timestamptz not null default now()
);

-- Generated apps
create table public.apps (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(id) on delete cascade,
  name           text not null,
  category       text not null
                   constraint apps_category_check
                   check (category in ('booking', 'crm', 'inventory', 'portal')),
  status         text not null default 'generating'
                   constraint apps_status_check
                   check (status in ('generating', 'ready', 'deploying', 'deployed', 'failed', 'deploy_failed')),
  intake_data    jsonb,
  generated_code text,
  deploy_url     text,
  created_at     timestamptz not null default now()
);

-- Subscriptions (managed by Stripe webhooks)
create table public.subscriptions (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null references public.profiles(id) on delete cascade,
  stripe_customer_id       text,
  stripe_subscription_id   text unique,
  plan                     text
                             constraint subscriptions_plan_check
                             check (plan in ('starter', 'growth', 'pro')),
  status                   text
                             constraint subscriptions_status_check
                             check (status in ('active', 'cancelled', 'past_due', 'trialing')),
  current_period_end       timestamptz,
  created_at               timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- INDEXES
-- ---------------------------------------------------------------

create index apps_user_id_idx on public.apps(user_id);
create index apps_status_idx  on public.apps(status);
create index subscriptions_user_id_idx           on public.subscriptions(user_id);
create index subscriptions_stripe_customer_id_idx on public.subscriptions(stripe_customer_id);

-- ---------------------------------------------------------------
-- TRIGGER: auto-create profile when a new auth user signs up
-- ---------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, company_name)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'company_name'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ---------------------------------------------------------------

-- profiles --
alter table public.profiles enable row level security;

create policy "profiles: users read own"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles: users update own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- INSERT is handled by the trigger (security definer) so no user INSERT policy needed.
-- The service role key used in server-side code bypasses RLS entirely.

-- apps --
alter table public.apps enable row level security;

create policy "apps: users select own"
  on public.apps for select
  using (auth.uid() = user_id);

create policy "apps: users insert own"
  on public.apps for insert
  with check (auth.uid() = user_id);

create policy "apps: users update own"
  on public.apps for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "apps: users delete own"
  on public.apps for delete
  using (auth.uid() = user_id);

-- subscriptions --
-- Only the Stripe webhook (service role) writes subscription rows.
-- Users can read their own.
alter table public.subscriptions enable row level security;

create policy "subscriptions: users read own"
  on public.subscriptions for select
  using (auth.uid() = user_id);
