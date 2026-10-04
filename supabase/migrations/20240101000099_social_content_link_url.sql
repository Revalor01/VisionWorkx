-- Per-post link for Social posts imported from a campaign (e.g. the AI quiz
-- with ?src=facebook-p3). When set, publishPost uses it for the Facebook /
-- YouTube tracked short link instead of the brand's website_url. Null keeps
-- today's behaviour. Purely additive; RLS unchanged (service role only).
-- social_content is also written by revalor-admin's Studios; a nullable
-- column doesn't affect its inserts.
alter table public.social_content
  add column if not exists link_url text
    check (link_url is null or (link_url ~ '^https://' and char_length(link_url) <= 500));
