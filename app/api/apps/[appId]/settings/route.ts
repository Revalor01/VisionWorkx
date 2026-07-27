import { NextRequest, NextResponse } from "next/server";
import {
  createServerClient,
  createServiceClient,
  createTenantServiceClient,
} from "@/lib/supabase";
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
    .select("logo_url, social_links, updated_at")
    .eq("id", true)
    .single();

  if (error) {
    // 42P01 = table does not exist — app was deployed before this feature shipped.
    if (error.code === "42P01") {
      return NextResponse.json(
        { error: "Settings aren't available for this app yet.", unavailable: true },
        { status: 404 }
      );
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

  let body: { logoPath?: string | null; socialLinks?: Record<string, string> };
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

  const { error: tenantError } = await tenantClient
    .from("site_settings")
    .update(update)
    .eq("id", true);

  if (tenantError) {
    if (tenantError.code === "42P01") {
      return NextResponse.json(
        { error: "Settings aren't available for this app yet.", unavailable: true },
        { status: 404 }
      );
    }
    return NextResponse.json({ error: tenantError.message }, { status: 500 });
  }

  // Keep apps.intake_data.logoPath in sync — otherwise the next full "Edit"
  // regenerate would silently revert this logo change back to the stale
  // intake value (the deploy pipeline seeds site_settings.logo_url from
  // intake_data on every deploy). social_links has no IntakeData field and
  // the deploy pipeline never touches it, so no analogous sync is needed.
  if (body.logoPath !== undefined) {
    const currentIntake = (app.intake_data as IntakeData) ?? ({} as IntakeData);
    const mergedIntake: IntakeData = { ...currentIntake };
    if (body.logoPath) mergedIntake.logoPath = body.logoPath;
    else delete mergedIntake.logoPath;

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
