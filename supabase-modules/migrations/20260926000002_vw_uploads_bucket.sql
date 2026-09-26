-- A5 Lead Capture: private storage for files visitors attach to module forms
-- (photos, PDFs), up to 10 MB each.
--
-- Access (plain English): the bucket is PRIVATE and has NO storage policies,
-- so no browser — visitor or workspace member — can list, read or write it
-- directly. The VisionWorkx server (service role) hands out one-time signed
-- UPLOAD links to visitors after domain + rate-limit checks, and short-lived
-- signed DOWNLOAD links to signed-in members of the owning workspace only.
-- Paths are <module uuid>/<random uuid>/<file name>.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'vw-uploads', 'vw-uploads', false, 10485760,
  array['image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif','application/pdf']
)
on conflict (id) do nothing;
