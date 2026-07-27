import { NextRequest, NextResponse } from "next/server";
import {
  createServerClient,
  createServiceClient,
  createTenantServiceClient,
} from "@/lib/supabase";
import { HEX_COLOR_RE, hexToRgbTriplet } from "@/lib/color";
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
  const { data: settings, error } = await tenantClient
    .from("site_settings")
    .select("logo_url, social_links, updated_at, primary_color, background_color")
    .eq("id", true)
    .single();

  if (error) {
    // PGRST205 (PostgREST "table not in schema cache") or 42P01 (Postgres
    // "undefined_table") — app was deployed before the logo/social feature
    // shipped, no site_settings table at all.
    if (error.code === "PGRST205" || error.code === "42P01") {
      return NextResponse.json(
        { error: "Settings aren't available for this app yet.", unavailable: true },
        { status: 404 }
      );
    }
    // PGRST204 (PostgREST "column not in schema cache") or 42703 (Postgres
    // "undefined_column") — a "middle vintage" app: deployed after logo/
    // social shipped but before colors did, so site_settings exists but
    // without the color columns until its next deploy. Fall back to the
    // logo/social-only select so that tier keeps working, and let the
    // client hide just the color section rather than the whole page.
    if (error.code === "PGRST204" || error.code === "42703") {
      const { data: fallbackSettings, error: fallbackError } = await tenantClient
        .from("site_settings")
        .select("logo_url, social_links, updated_at")
        .eq("id", true)
        .single();
      if (fallbackError) {
        return NextResponse.json({ error: fallbackError.message }, { status: 500 });
      }
      return NextResponse.json({ settings: fallbackSettings, colorsUnavailable: true });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ settings });
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
    // Middle-vintage app: color columns don't exist yet. Only reachable if
    // a caller sends color fields directly — the settings page itself hides
    // that UI once GET reports colorsUnavailable.
    if (tenantError.code === "PGRST204" || tenantError.code === "42703") {
      return NextResponse.json(
        { error: "Brand colors aren't available for this app yet.", colorsUnavailable: true },
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
