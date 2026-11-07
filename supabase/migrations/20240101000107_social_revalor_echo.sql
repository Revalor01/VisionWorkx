-- Revalor page copies (owner, 2026-11-07): every Facebook post a product brand
-- publishes (not Revalor Kids) gets a copy on the Revalor (Revalor LLC) Facebook
-- Page about a day later, at most one copy a day. echo_of marks a copy and points
-- at the original, so a copy is never copied again and each original is copied once.
-- Same table and RLS as before (service-role only); no new policies needed.

alter table public.social_content
  add column echo_of uuid references public.social_content(id) on delete set null;

-- One copy per original.
create unique index social_content_echo_of_idx
  on public.social_content (echo_of)
  where echo_of is not null;

-- Rollback (by hand only, with explicit OK):
--   drop index if exists public.social_content_echo_of_idx;
--   alter table public.social_content drop column if exists echo_of;
