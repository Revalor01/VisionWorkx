-- No schema change. Marker for the tenant-schema teardown safety fix:
-- lib/apps/tenantSchema.ts now removes a tenant schema from PostgREST's
-- db_schema exposure list BEFORE dropping it. Dropping without that step
-- 503s the entire REST API (PostgREST fails to reflect a missing schema),
-- taking down every generated app and the Vision Workx app itself.
-- Wired into /api/cron/preview-cleanup and /api/cron/canary-build.
select 1;
