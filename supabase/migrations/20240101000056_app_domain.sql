-- Phase 5 of "Closing the Builder Loop": self-serve custom domains.
--
-- The Growth tier advertises a custom domain but there was no way to set
-- one. This stores the Vercel project id (so domain calls don't depend on
-- reconstructing the slug) and the domain the owner has attached.

alter table public.apps
  add column if not exists vercel_project_id text,
  add column if not exists custom_domain text;
