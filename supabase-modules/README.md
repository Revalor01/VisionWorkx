# VisionWorkx modules database

Migrations for the **dedicated "visionworkx-modules" Supabase project** — the database behind
VisionWorkx embeddable modules (workspaces, modules, submissions, automation events). It is a
different project from the main VisionWorkx database in `../supabase/`; never mix the two.

Why separate: submissions are our clients' customers' personal data, and several Revalor apps hold
service keys to the main project.

- Apply in filename order. Show the SQL to the owner first.
- After applying, run `node --env-file=.env.local scripts/modules-isolation-test.mjs`.
- App env vars (Vercel, vision-workx project): `MODULES_SUPABASE_URL`,
  `NEXT_PUBLIC_MODULES_SUPABASE_URL`, `NEXT_PUBLIC_MODULES_SUPABASE_ANON_KEY`,
  `MODULES_SUPABASE_SERVICE_ROLE_KEY`, plus `MODULES_DIRECTORY_SECRET` for revalor-admin's
  read-only directory.
