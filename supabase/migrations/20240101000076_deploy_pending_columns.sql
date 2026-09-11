-- T0.1 of docs/stabilization-plan.md — the deploy pipeline can't corrupt itself.
--
-- `pending_generated_code` holds a build-in-progress: a fresh generation or a
-- repair pass. `runDeploy` reads (pending_generated_code, generated_code) and
-- builds from the pending blob when it's set. Only a fully successful deploy
-- promotes it — `generated_code := pending_generated_code`, `pending := null` —
-- in a single UPDATE. Any failure clears `pending_generated_code` and leaves
-- `generated_code` (the last version that actually deployed) untouched, so a
-- throw anywhere in the pipeline can never leave the row with no usable source.
--
-- `pending_deploy_url` is reserved for the same pattern on the URL; unused
-- today but cheap to add in the same pass.

alter table public.apps
  add column if not exists pending_generated_code text,
  add column if not exists pending_deploy_url text;

comment on column public.apps.pending_generated_code is
  'Build-in-progress source (generation/repair). Promoted to generated_code only on a successful deploy; cleared on failure. See docs/stabilization-plan.md T0.1.';
