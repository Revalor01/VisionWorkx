-- Add "invoicing" (quotes/invoicing for contractors & home-service businesses)
-- and "membership" (recurring billing + check-ins for gyms/studios) as app
-- categories alongside the original booking/crm/inventory/portal.

alter table public.apps
  drop constraint apps_category_check,
  add constraint apps_category_check
    check (category in ('booking', 'crm', 'inventory', 'portal', 'invoicing', 'membership'));
