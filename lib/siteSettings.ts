import type { createTenantServiceClient } from "@/lib/supabase";

type TenantClient = ReturnType<typeof createTenantServiceClient>;

const FULL_SELECT =
  "logo_url, social_links, updated_at, primary_color, background_color, gallery_photos";
const NO_GALLERY_SELECT =
  "logo_url, social_links, updated_at, primary_color, background_color";
const BASE_SELECT = "logo_url, social_links, updated_at";

function isMissingTable(code?: string) {
  return code === "PGRST205" || code === "42P01";
}
function isMissingColumn(code?: string) {
  return code === "PGRST204" || code === "42703";
}

export type SiteSettingsRow = {
  logo_url: string | null;
  social_links: Record<string, string>;
  updated_at?: string;
  primary_color?: string | null;
  background_color?: string | null;
  gallery_photos?: string[];
};

export type SiteSettingsCascadeResult =
  | {
      status: "ok";
      settings: SiteSettingsRow;
      colorsUnavailable: boolean;
      galleryUnavailable: boolean;
    }
  | { status: "unavailable" }
  | { status: "error"; message: string };

// Colors and gallery_photos were added to site_settings at different times
// and ship independently, so an app can be missing gallery only, colors
// only, both, or neither depending on when it was last deployed relative to
// each feature's ship date. A SELECT naming ANY missing column fails
// entirely — there's no "whichever columns exist" query — so tiers must be
// tried widest-to-narrowest in this exact order.
export async function loadSiteSettingsCascade(
  tenantClient: TenantClient
): Promise<SiteSettingsCascadeResult> {
  const full = await tenantClient
    .from("site_settings")
    .select(FULL_SELECT)
    .eq("id", true)
    .single();
  if (!full.error) {
    return {
      status: "ok",
      settings: full.data as unknown as SiteSettingsRow,
      colorsUnavailable: false,
      galleryUnavailable: false,
    };
  }
  if (isMissingTable(full.error.code)) return { status: "unavailable" };
  if (!isMissingColumn(full.error.code)) {
    return { status: "error", message: full.error.message };
  }

  const noGallery = await tenantClient
    .from("site_settings")
    .select(NO_GALLERY_SELECT)
    .eq("id", true)
    .single();
  if (!noGallery.error) {
    return {
      status: "ok",
      settings: noGallery.data as unknown as SiteSettingsRow,
      colorsUnavailable: false,
      galleryUnavailable: true,
    };
  }
  if (isMissingTable(noGallery.error.code)) return { status: "unavailable" };
  if (!isMissingColumn(noGallery.error.code)) {
    return { status: "error", message: noGallery.error.message };
  }

  const base = await tenantClient
    .from("site_settings")
    .select(BASE_SELECT)
    .eq("id", true)
    .single();
  if (!base.error) {
    return {
      status: "ok",
      settings: base.data as unknown as SiteSettingsRow,
      colorsUnavailable: true,
      galleryUnavailable: true,
    };
  }
  if (isMissingTable(base.error.code)) return { status: "unavailable" };
  return { status: "error", message: base.error.message };
}
