-- =============================================================
-- Vision Workx — VisionWorkx Promote (Migration 16)
-- =============================================================
--
-- Promote is a distinct product line (AI ad-creative generation +
-- campaign management for VisionWorkx customers) sharing this project's
-- auth/profiles but with its own billing. Kept in separate promote_*
-- tables rather than reusing `apps`/`subscriptions`:
--   - `subscriptions` assumes one row per user_id for the core product
--     (see app/api/webhooks/stripe/route.ts onConflict: "user_id") —
--     colliding Promote billing into it would corrupt core plan state.
--   - promote_businesses is conceptually unrelated to `apps` (a
--     generated app); a user may have Promote without ever generating
--     a VisionWorkx app.

-- ---------------------------------------------------------------
-- TABLES
-- ---------------------------------------------------------------

create table public.promote_businesses (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references public.profiles(id) on delete cascade,
  name                  text not null,
  business_type         text not null,
  phone                 text,
  email                 text,
  address               text,
  city                  text,
  state                 text,
  zip_code              text,
  description           text,
  logo_url              text,
  photo_urls            text[] not null default '{}',
  services              jsonb not null default '[]', -- [{name, price, duration}]
  brand_color           text not null default '#4f8ef7',
  booking_url           text,
  website_url           text,
  -- Phase 2 (Meta/Google Ads) — columns exist now so no later migration is needed.
  meta_ad_account_id    text,
  meta_access_token     text,
  google_customer_id    text,
  google_refresh_token  text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (user_id)
);

create table public.promote_creatives (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.promote_businesses(id) on delete cascade,
  name          text not null,
  headline      text not null,
  body_text     text not null,
  cta           text not null,
  script        text,
  image_url     text not null,
  template_id   text not null,
  format        text not null default '1080x1080'
                  constraint promote_creatives_format_check
                  check (format in ('1080x1080', '1080x1920', '1200x628')),
  status        text not null default 'draft'
                  constraint promote_creatives_status_check
                  check (status in ('draft', 'approved', 'archived')),
  created_at    timestamptz not null default now()
);

create table public.promote_campaigns (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references public.promote_businesses(id) on delete cascade,
  name              text not null,
  platform          text not null
                      constraint promote_campaigns_platform_check
                      check (platform in ('meta', 'google', 'both')),
  objective         text not null
                      constraint promote_campaigns_objective_check
                      check (objective in ('awareness', 'traffic', 'leads', 'conversions')),
  status            text not null default 'draft'
                      constraint promote_campaigns_status_check
                      check (status in ('draft', 'pending_platform_approval', 'paused', 'completed')),
  daily_budget      numeric(10,2) not null,
  total_budget      numeric(10,2),
  start_date        date not null,
  end_date          date,
  target_audience   jsonb not null default '{}', -- {ageMin, ageMax, genders, interests, radius, location}
  -- Phase 2 sync fields
  meta_campaign_id    text,
  google_campaign_id  text,
  total_spend       numeric(10,2) not null default 0,
  impressions       integer not null default 0,
  clicks            integer not null default 0,
  conversions       integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table public.promote_campaign_creatives (
  campaign_id   uuid not null references public.promote_campaigns(id) on delete cascade,
  creative_id   uuid not null references public.promote_creatives(id) on delete cascade,
  primary key (campaign_id, creative_id)
);

create table public.promote_analytics (
  id            uuid primary key default gen_random_uuid(),
  campaign_id   uuid not null references public.promote_campaigns(id) on delete cascade,
  date          date not null,
  platform      text not null,
  impressions   integer not null default 0,
  clicks        integer not null default 0,
  spend         numeric(10,2) not null default 0,
  conversions   integer not null default 0,
  cpc           numeric(10,4) not null default 0,
  cpm           numeric(10,4) not null default 0,
  roas          numeric(10,4) not null default 0,
  unique (campaign_id, date, platform)
);

-- Separate from `subscriptions` — see header note.
create table public.promote_subscriptions (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null references public.profiles(id) on delete cascade,
  stripe_customer_id       text,
  stripe_subscription_id   text unique,
  plan                     text
                             constraint promote_subscriptions_plan_check
                             check (plan in ('starter', 'growth', 'pro')),
  status                   text
                             constraint promote_subscriptions_status_check
                             check (status in ('active', 'cancelled', 'past_due', 'trialing')),
  current_period_end       timestamptz,
  created_at               timestamptz not null default now(),
  unique (user_id)
);

-- ---------------------------------------------------------------
-- INDEXES
-- ---------------------------------------------------------------

create index promote_businesses_user_id_idx on public.promote_businesses(user_id);
create index promote_creatives_business_id_idx on public.promote_creatives(business_id);
create index promote_campaigns_business_id_idx on public.promote_campaigns(business_id);
create index promote_analytics_campaign_id_idx on public.promote_analytics(campaign_id);
create index promote_subscriptions_user_id_idx on public.promote_subscriptions(user_id);
create index promote_subscriptions_stripe_customer_id_idx on public.promote_subscriptions(stripe_customer_id);

-- ---------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ---------------------------------------------------------------

-- promote_businesses: direct ownership --
alter table public.promote_businesses enable row level security;

create policy "promote_businesses: users select own"
  on public.promote_businesses for select
  using (auth.uid() = user_id);

create policy "promote_businesses: users insert own"
  on public.promote_businesses for insert
  with check (auth.uid() = user_id);

create policy "promote_businesses: users update own"
  on public.promote_businesses for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "promote_businesses: users delete own"
  on public.promote_businesses for delete
  using (auth.uid() = user_id);

-- promote_creatives: join-through-business ownership (same pattern as automation_workflows) --
alter table public.promote_creatives enable row level security;

create policy "promote_creatives: owners select own"
  on public.promote_creatives for select
  using (exists (
    select 1 from public.promote_businesses b where b.id = business_id and b.user_id = auth.uid()
  ));

create policy "promote_creatives: owners insert own"
  on public.promote_creatives for insert
  with check (exists (
    select 1 from public.promote_businesses b where b.id = business_id and b.user_id = auth.uid()
  ));

create policy "promote_creatives: owners update own"
  on public.promote_creatives for update
  using (exists (
    select 1 from public.promote_businesses b where b.id = business_id and b.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.promote_businesses b where b.id = business_id and b.user_id = auth.uid()
  ));

create policy "promote_creatives: owners delete own"
  on public.promote_creatives for delete
  using (exists (
    select 1 from public.promote_businesses b where b.id = business_id and b.user_id = auth.uid()
  ));

-- promote_campaigns: join-through-business ownership --
alter table public.promote_campaigns enable row level security;

create policy "promote_campaigns: owners select own"
  on public.promote_campaigns for select
  using (exists (
    select 1 from public.promote_businesses b where b.id = business_id and b.user_id = auth.uid()
  ));

create policy "promote_campaigns: owners insert own"
  on public.promote_campaigns for insert
  with check (exists (
    select 1 from public.promote_businesses b where b.id = business_id and b.user_id = auth.uid()
  ));

create policy "promote_campaigns: owners update own"
  on public.promote_campaigns for update
  using (exists (
    select 1 from public.promote_businesses b where b.id = business_id and b.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.promote_businesses b where b.id = business_id and b.user_id = auth.uid()
  ));

create policy "promote_campaigns: owners delete own"
  on public.promote_campaigns for delete
  using (exists (
    select 1 from public.promote_businesses b where b.id = business_id and b.user_id = auth.uid()
  ));

-- promote_campaign_creatives: join-through-campaign-through-business --
alter table public.promote_campaign_creatives enable row level security;

create policy "promote_campaign_creatives: owners select own"
  on public.promote_campaign_creatives for select
  using (exists (
    select 1 from public.promote_campaigns c
    join public.promote_businesses b on b.id = c.business_id
    where c.id = campaign_id and b.user_id = auth.uid()
  ));

create policy "promote_campaign_creatives: owners insert own"
  on public.promote_campaign_creatives for insert
  with check (exists (
    select 1 from public.promote_campaigns c
    join public.promote_businesses b on b.id = c.business_id
    where c.id = campaign_id and b.user_id = auth.uid()
  ));

create policy "promote_campaign_creatives: owners delete own"
  on public.promote_campaign_creatives for delete
  using (exists (
    select 1 from public.promote_campaigns c
    join public.promote_businesses b on b.id = c.business_id
    where c.id = campaign_id and b.user_id = auth.uid()
  ));

-- promote_analytics: read-only for owners, written only by service role (Phase 2 sync) --
alter table public.promote_analytics enable row level security;

create policy "promote_analytics: owners select own"
  on public.promote_analytics for select
  using (exists (
    select 1 from public.promote_campaigns c
    join public.promote_businesses b on b.id = c.business_id
    where c.id = campaign_id and b.user_id = auth.uid()
  ));

-- promote_subscriptions: only the Stripe webhook (service role) writes; users read their own --
alter table public.promote_subscriptions enable row level security;

create policy "promote_subscriptions: users read own"
  on public.promote_subscriptions for select
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------
-- STORAGE: promote-assets bucket (public, mirrors the logos bucket)
-- ---------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'promote-assets',
  'promote-assets',
  true, -- public from the start: creative images must be publicly loadable
        -- both by the dashboard <img> tags and eventually Meta/Google ad APIs
  10485760, -- 10 MB (rendered creatives are larger than logos)
  array['image/png', 'image/jpeg', 'image/webp']
);

create policy "promote-assets: users upload own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'promote-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "promote-assets: users update own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'promote-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "promote-assets: users delete own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'promote-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Public bucket — anyone (including anon) can read, matching the logos bucket.
create policy "promote-assets: public read"
  on storage.objects for select
  to public
  using (bucket_id = 'promote-assets');
