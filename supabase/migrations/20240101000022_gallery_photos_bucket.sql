-- =============================================================
-- Vision Workx — Storage: gallery-photos bucket
-- =============================================================
--
-- Mirrors the `logos` bucket's per-user-folder RLS pattern (migration 1):
-- authenticated, client-side uploads scoped to the user's own folder.
-- Public from the start (logos only became public later, in migration 11) —
-- gallery photos are always meant to render on the generated app's public
-- homepage via a plain public URL.
--
-- 10 MB per photo (vs 5 MB for logos): logos are small icon/vector-style
-- graphics; gallery photos are full project/portfolio photos, often
-- phone-camera originals landing in the 3-8 MB range.
--
-- The 9-photo-per-app cap (clean 3x3 grid) is enforced by the settings API,
-- not here — storage RLS has no concept of "how many objects already exist
-- in this folder," only per-object folder ownership.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'gallery-photos',
  'gallery-photos',
  true,
  10485760, -- 10 MB
  array['image/png', 'image/jpeg', 'image/webp']
);

create policy "gallery-photos: users upload own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'gallery-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "gallery-photos: users read own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'gallery-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "gallery-photos: users update own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'gallery-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "gallery-photos: users delete own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'gallery-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
