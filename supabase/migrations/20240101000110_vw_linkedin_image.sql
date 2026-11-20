-- =============================================================
-- LinkedIn posts: optional image (Migration 110)
-- =============================================================
--
-- Optional image for a LinkedIn post. The file lives in the existing private
-- social-content-images bucket under linkedin/<post id>/ (no new bucket, no
-- storage policy change: reachable only via service-role signed URLs). When a
-- scheduled post comes due, the RSS feed (/api/social/linkedin/feed) adds a
-- short-lived signed link as the item's <enclosure>, which the Zapier
-- "LinkedIn Create Company Update" step attaches as post media.
--
-- Additive only, no RLS change (default-deny, service-role only). `if not
-- exists` because the owner may already have run it by hand. Shared table:
-- revalor-admin reads linkedin_posts with explicit column lists, unaffected.

alter table public.linkedin_posts
  add column if not exists image_path text;

-- Rollback (destructive: drops a column, needs explicit OK under CLAUDE.md):
--   alter table public.linkedin_posts drop column if exists image_path;
