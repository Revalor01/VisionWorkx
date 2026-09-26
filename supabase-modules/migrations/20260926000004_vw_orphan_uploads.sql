-- A5 follow-up: find uploads nobody ever submitted (a visitor attached a file
-- and left). Returns object paths in vw-uploads older than p_older_hours that
-- no submission references, so a server-only cron can delete them through the
-- storage API. Read-only; server (service role) only.
create or replace function public.vw_orphan_uploads(p_older_hours integer default 24, p_limit integer default 500)
returns setof text language sql stable security definer set search_path = public, storage as $$
  select o.name
    from storage.objects o
   where o.bucket_id = 'vw-uploads'
     and o.created_at < now() - make_interval(hours => greatest(p_older_hours, 1))
     and not exists (
       select 1 from public.vw_submissions s
        where jsonb_path_exists(s.data, '$.* ? (@.path == $p)', jsonb_build_object('p', o.name))
     )
   order by o.created_at
   limit least(greatest(p_limit, 1), 1000);
$$;
revoke all on function public.vw_orphan_uploads(integer, integer) from public, anon, authenticated;
grant execute on function public.vw_orphan_uploads(integer, integer) to service_role;
