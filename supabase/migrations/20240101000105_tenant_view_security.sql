-- Existing tenant schemas: let the platform's service-role reader in (SELECT
-- only, for Insights) and make their views respect the underlying tables' RLS.
--
-- Generated apps' vw_metrics_daily / vw_automation_due views were plain
-- `create view`, so they ran with their owner's rights and skipped RLS; with
-- the deploy route's anon SELECT grant, vw_automation_due exposed customers'
-- emails and phone numbers to the public anon key (Supabase advisor
-- security_definer_view, 2026-10-17). Separately, the deploy route never
-- granted service_role on tenant tables, so readTenantMetrics() got
-- `permission denied` and Insights showed no data for any app.
--
-- New deploys apply the same rules via tenantAccessHardeningSql() in
-- lib/apps/tenantSchema.ts. No-op on a fresh database (no tenant schemas).
-- app_ef6ca6a6's views were already switched to security_invoker live on
-- 2026-10-20; re-running that part is harmless.
do $$
declare s text; v text;
begin
  for s in select nspname from pg_namespace where nspname ~ '^app_[0-9a-f]{8}$' loop
    execute format('grant usage on schema %I to service_role', s);
    execute format('grant select on all tables in schema %I to service_role', s);
    for v in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = s and c.relkind = 'v' loop
      execute format('alter view %I.%I set (security_invoker = true)', s, v);
    end loop;
  end loop;
end $$;
