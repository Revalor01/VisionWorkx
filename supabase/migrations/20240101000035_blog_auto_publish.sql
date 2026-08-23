-- Score-gated auto-publish for the blog pipeline: a generated post that
-- clears the SEO score threshold and has no banned words publishes itself
-- immediately instead of waiting for manual review. This column just lets
-- the admin dashboard tell auto- from human-approved publishes apart.
alter table public.blog_posts add column auto_published boolean not null default false;
