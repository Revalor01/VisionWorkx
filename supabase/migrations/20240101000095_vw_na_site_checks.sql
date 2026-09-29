-- Needs Analyzer website checks (/admin/needs-analyzer/website): what the site
-- assessor found on a business's website. Internal Revalor sales data,
-- operator-only, same as the other vw_na_* tables.
--
-- RLS is on with no policies: no browser (anon or signed-in) can read or write
-- this table. Only VisionWorkx server code using the service role can, after it
-- has checked the operator (or, for the issues ticked for the proposal, a valid
-- proposal share token).

create table if not exists vw_na_site_checks (
  id uuid primary key default gen_random_uuid(),
  url text not null,                    -- what was entered
  final_url text,                       -- where it ended up after redirects
  assessment_id uuid references vw_na_assessments(id) on delete set null,
  report jsonb not null,                -- detected platform, capabilities, issues, suggested modules
  pagespeed jsonb,                      -- Google PageSpeed scores, when GOOGLE_PAGESPEED_API_KEY is set
  ai_review jsonb,                      -- Claude's read of the site, only when asked for
  proposal_issues text[] not null default '{}', -- issue ids shown on the client proposal
  is_test boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists vw_na_site_checks_assessment_idx on vw_na_site_checks (assessment_id, created_at desc);
create index if not exists vw_na_site_checks_created_idx on vw_na_site_checks (created_at desc);
alter table vw_na_site_checks enable row level security;
