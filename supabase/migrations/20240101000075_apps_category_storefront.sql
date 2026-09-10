-- Allow the "storefront" category on apps.
alter table public.apps drop constraint if exists apps_category_check;
alter table public.apps add constraint apps_category_check
  check (category = any (array[
    'booking','crm','inventory','portal','invoicing','membership','storefront'
  ]));

comment on table public.apps is 'Generated apps; preview apps have null user_id.';
