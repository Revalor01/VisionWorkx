import type { SupabaseClient } from "@supabase/supabase-js";

// Shared logo-upload logic — used by both the onboarding form (OnboardForm.tsx)
// and the post-deploy settings page (SettingsClient.tsx), so both write to the
// same "logos" storage bucket with the same path convention.
export async function uploadLogo(
  supabase: SupabaseClient,
  userId: string,
  logoFile: File
): Promise<string | null> {
  const ext = logoFile.name.split(".").pop() ?? "png";
  const path = `${userId}/${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("logos")
    .upload(path, logoFile, { upsert: false });

  if (uploadError) {
    console.error("[logo upload]", uploadError.message);
    return null;
  }

  return path;
}

export function logoPathToUrl(logoPath: string): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/logos/${logoPath}`;
}
