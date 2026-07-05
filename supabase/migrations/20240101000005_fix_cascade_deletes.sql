-- The live public schema's foreign keys were missing ON DELETE CASCADE
-- even though 20240101000000_init.sql declares it — likely lost when a
-- generated tenant app's migration ran DDL against the wrong schema.
-- Without this, deleting a user via the Admin API fails with a foreign
-- key violation the moment they have any profiles/apps/subscriptions row,
-- which blocks the admin "delete account" feature entirely.

alter table public.profiles
  drop constraint if exists profiles_id_fkey,
  add constraint profiles_id_fkey
    foreign key (id) references auth.users(id) on delete cascade;

alter table public.apps
  drop constraint if exists apps_user_id_fkey,
  add constraint apps_user_id_fkey
    foreign key (user_id) references public.profiles(id) on delete cascade;

alter table public.subscriptions
  drop constraint if exists subscriptions_user_id_fkey,
  add constraint subscriptions_user_id_fkey
    foreign key (user_id) references public.profiles(id) on delete cascade;
