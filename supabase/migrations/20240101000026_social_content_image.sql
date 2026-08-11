alter table social_content add column image_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'social-content-images',
  'social-content-images',
  false,
  10485760, -- 10 MB
  array['image/png', 'image/jpeg', 'image/webp']
);

-- No storage.objects policies — same lockdown pattern as
-- social-video-assets: only reachable via a service-role-minted
-- signed URL, never directly public.
