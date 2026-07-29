import { NextRequest, NextResponse } from "next/server";
import {
  createServerClient,
  createServiceClient,
  createTenantServiceClient,
} from "@/lib/supabase";
import { HEX_COLOR_RE, hexToRgbTriplet } from "@/lib/color";
import { loadSiteSettingsCascade } from "@/lib/siteSettings";
import type { IntakeData } from "@/lib/database.types";

const SOCIAL_LINK_KEYS = [
  "instagram",
  "facebook",
  "tiktok",
  "twitter",
  "linkedin",
  "youtube",
] as const;
type SocialLinkKey = (typeof SOCIAL_LINK_KEYS)[number];

// These render as raw <a href> in the customer's live site — bounded,
// https-only, no javascript:/data: URIs or other injection vectors.
const SOCIAL_URL_RE = /^https:\/\/[^\s"'<>]{1,500}$/;

// logoPath must be a storage path under our own "logos" bucket (the same
// convention uploadLogo() writes: "<userId>/<timestamp>.<ext>") — never an
// arbitrary external URL, to prevent hot-linking/spoofing via this API.
const LOGO_PATH_RE = /^[a-zA-Z0-9-]+\/[a-zA-Z0-9_.-]+$/;

const MAX_GALLERY_PHOTOS = 9;

// galleryPhotos entries must be full public URLs under our own
// gallery-photos bucket, in exactly the shape uploadGalleryPhoto() produces
// — same reasoning as LOGO_PATH_RE — never an arbitrary external URL (this
// prevents hot-linking/spoofing via this API).
const GALLERY_PHOTO_URL_RE = new RegExp(
  "^" +
    process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
    "/storage/v1/object/public/gallery-photos/[a-zA-Z0-9-]+/[a-zA-Z0-9_.-]+$"
);

async function loadOwnedDeployedApp(appId: string, userId: string) {
  const serviceClient = createServiceClient();
  const { data: app } = await serviceClient
    .from("apps")
    .select("id, user_id, status, intake_data")
    .eq("id", appId)
    .single();

  if (!app || app.user_id !== userId) return { app: null, serviceClient };
  return { app, serviceClient };
}

export async function GET(req: NextRequest, { params }: { params: { appId: string } }) {
  const supabase = createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { app } = await loadOwnedDeployedApp(params.appId, user.id);
  if (!app) return NextResponse.json({ error: "App not found" }, { status: 404 });
  if (app.status !== "deployed") {
    return NextResponse.json({ error: "App is not live yet" }, { status: 409 });
  }

  const SCHEMA = `app_${params.appId.slice(0, 8)}`;
  const tenantClient = createTenantServiceClient(SCHEMA);
  const result = await loadSiteSettingsCascade(tenantClient);

  if (result.status === "unavailable") {
    return NextResponse.json(
      { error: "Settings aren't available for this app yet.", unavailable: true },
      { status: 404 }
    );
  }
  if (result.status === "error") {
    return NextResponse.json({ error: result.message }, { status: 500 });
  }
  return NextResponse.json({
    settings: result.settings,
    colorsUnavailable: result.colorsUnavailable,
    galleryUnavailable: result.galleryUnavailable,
  });
}

export async function PATCH(req: NextRequest, { params }: { params: { appId: string } }) {
  const supabase = createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    logoPath?: string | null;
    socialLinks?: Record<string, string>;
    primaryColor?: string;
    backgroundColor?: string;
    galleryPhotos?: string[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { app, serviceClient } = await loadOwnedDeployedApp(params.appId, user.id);
  if (!app) return NextResponse.json({ error: "App not found" }, { status: 404 });
  if (app.status !== "deployed") {
    return NextResponse.json({ error: "App is not live yet" }, { status: 409 });
  }

  // Validate logoPath
  if (body.logoPath !== undefined && body.logoPath !== null) {
    if (!LOGO_PATH_RE.test(body.logoPath)) {
      return NextResponse.json({ error: "Invalid logo path" }, { status: 400 });
    }
  }

  // Validate colors — always require a valid hex when present, no
  // clear/remove semantics like logo has (a UI needs colors to render).
  if (body.primaryColor !== undefined && !HEX_COLOR_RE.test(body.primaryColor)) {
    return NextResponse.json({ error: "Invalid primary color" }, { status: 400 });
  }
  if (body.backgroundColor !== undefined && !HEX_COLOR_RE.test(body.backgroundColor)) {
    return NextResponse.json({ error: "Invalid background color" }, { status: 400 });
  }

  // Validate galleryPhotos — full-array replacement, same mental model as
  // socialLinks. Server-side cap enforcement regardless of client UI state.
  if (body.galleryPhotos !== undefined) {
    if (!Array.isArray(body.galleryPhotos)) {
      return NextResponse.json({ error: "Invalid gallery photos" }, { status: 400 });
    }
    if (body.galleryPhotos.length > MAX_GALLERY_PHOTOS) {
      return NextResponse.json(
        { error: `A maximum of ${MAX_GALLERY_PHOTOS} gallery photos is allowed.` },
        { status: 400 }
      );
    }
    for (const url of body.galleryPhotos) {
      if (typeof url !== "string" || !GALLERY_PHOTO_URL_RE.test(url)) {
        return NextResponse.json({ error: "Invalid gallery photo URL" }, { status: 400 });
      }
    }
  }

  // Validate + whitelist social links
  const socialLinks: Partial<Record<SocialLinkKey, string>> = {};
  if (body.socialLinks) {
    for (const [key, value] of Object.entries(body.socialLinks)) {
      if (!(SOCIAL_LINK_KEYS as readonly string[]).includes(key)) continue;
      if (typeof value !== "string" || value.length === 0) continue;
      if (!SOCIAL_URL_RE.test(value)) {
        return NextResponse.json({ error: `Invalid URL for ${key}` }, { status: 400 });
      }
      socialLinks[key as SocialLinkKey] = value;
    }
  }

  const SCHEMA = `app_${params.appId.slice(0, 8)}`;
  const tenantClient = createTenantServiceClient(SCHEMA);

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.logoPath !== undefined) {
    update.logo_url = body.logoPath
      ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/logos/${body.logoPath}`
      : null;
  }
  if (body.socialLinks !== undefined) update.social_links = socialLinks;
  if (body.primaryColor !== undefined) {
    update.primary_color = body.primaryColor;
    update.primary_color_rgb = hexToRgbTriplet(body.primaryColor);
  }
  if (body.backgroundColor !== undefined) {
    update.background_color = body.backgroundColor;
    update.background_color_rgb = hexToRgbTriplet(body.backgroundColor);
  }
  if (body.galleryPhotos !== undefined) update.gallery_photos = body.galleryPhotos;

  const { error: tenantError } = await tenantClient
    .from("site_settings")
    .update(update)
    .eq("id", true);

  if (tenantError) {
    if (tenantError.code === "PGRST205" || tenantError.code === "42P01") {
      return NextResponse.json(
        { error: "Settings aren't available for this app yet.", unavailable: true },
        { status: 404 }
      );
    }
    // Middle-vintage app: color and/or gallery columns don't exist yet.
    // Only reachable if a caller sends those fields directly — the settings
    // page itself hides that UI once GET reports the flag. The missing-
    // column error alone can't tell us which column was missing, so
    // disambiguate by which fields this request actually touched.
    if (tenantError.code === "PGRST204" || tenantError.code === "42703") {
      const touchedGallery = body.galleryPhotos !== undefined;
      const touchedColors =
        body.primaryColor !== undefined || body.backgroundColor !== undefined;
      if (touchedGallery && !touchedColors) {
        return NextResponse.json(
          { error: "Gallery photos aren't available for this app yet.", galleryUnavailable: true },
          { status: 404 }
        );
      }
      if (touchedColors && !touchedGallery) {
        return NextResponse.json(
          { error: "Brand colors aren't available for this app yet.", colorsUnavailable: true },
          { status: 404 }
        );
      }
      return NextResponse.json(
        {
          error: "Some settings aren't available for this app yet.",
          colorsUnavailable: true,
          galleryUnavailable: true,
        },
        { status: 404 }
      );
    }
    return NextResponse.json({ error: tenantError.message }, { status: 500 });
  }

  // Keep apps.intake_data in sync for logoPath/primaryColor/backgroundColor —
  // otherwise the next full "Edit" regenerate would silently revert these
  // changes back to the stale intake values (the deploy pipeline seeds
  // site_settings from intake_data on every deploy). social_links has no
  // IntakeData field and the deploy pipeline never touches it, so no
  // analogous sync is needed there.
  if (
    body.logoPath !== undefined ||
    body.primaryColor !== undefined ||
    body.backgroundColor !== undefined
  ) {
    const currentIntake = (app.intake_data as IntakeData) ?? ({} as IntakeData);
    const mergedIntake: IntakeData = { ...currentIntake };
    if (body.logoPath !== undefined) {
      if (body.logoPath) mergedIntake.logoPath = body.logoPath;
      else delete mergedIntake.logoPath;
    }
    if (body.primaryColor !== undefined) mergedIntake.primaryColor = body.primaryColor;
    if (body.backgroundColor !== undefined) mergedIntake.backgroundColor = body.backgroundColor;

    const { error: intakeError } = await serviceClient
      .from("apps")
      .update({ intake_data: mergedIntake })
      .eq("id", params.appId);
    if (intakeError) {
      console.error("[api/apps/settings] intake_data sync failed:", intakeError.message);
    }
  }

  return NextResponse.json({ ok: true });
}
