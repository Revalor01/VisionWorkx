-- A generated tenant app's migration created its own on_auth_user_created
-- trigger on auth.users (shared across all schemas), which silently
-- replaced the platform's trigger and broke signups for every customer.
-- Restore it to point at the platform's own handle_new_user().
-- The deploy pipeline (/api/deploy) now blocks generated migrations from
-- touching auth.users or the public schema, so this shouldn't recur.

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
