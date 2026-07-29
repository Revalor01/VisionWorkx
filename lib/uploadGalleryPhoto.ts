import type { SupabaseClient } from "@supabase/supabase-js";

export const GALLERY_PHOTOS_BUCKET = "gallery-photos";
export const MAX_GALLERY_PHOTOS = 9;

// Called once per file from SettingsClient's multi-select input (Promise.all).
// Path suffixes `index` — not just Date.now() — because a batch upload can
// fire two calls within the same millisecond, which would otherwise collide
// under uploadLogo()'s single-file path convention.
export async function uploadGalleryPhoto(
  supabase: SupabaseClient,
  userId: string,
  file: File,
  index: number
): Promise<string | null> {
  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `${userId}/${Date.now()}-${index}.${ext}`;

  const { error } = await supabase.storage
    .from(GALLERY_PHOTOS_BUCKET)
    .upload(path, file, { upsert: false });

  if (error) {
    console.error("[gallery photo upload]", error.message);
    return null;
  }
  return path;
}

export function galleryPhotoPathToUrl(path: string): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${GALLERY_PHOTOS_BUCKET}/${path}`;
}

// Inverse — needed by handleSave()'s delete flow to turn a stored full URL
// back into a storage path for supabase.storage.remove().
export function galleryPhotoUrlToPath(url: string): string | null {
  const prefix = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${GALLERY_PHOTOS_BUCKET}/`;
  return url.startsWith(prefix) ? url.slice(prefix.length) : null;
}
