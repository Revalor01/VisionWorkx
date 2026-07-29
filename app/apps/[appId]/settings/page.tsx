import { redirect } from "next/navigation";
import { createServerClient, createTenantServiceClient } from "@/lib/supabase";
import { loadSiteSettingsCascade } from "@/lib/siteSettings";
import SettingsClient from "./SettingsClient";

export default async function AppSettingsPage({
  params,
}: {
  params: { appId: string };
}) {
  const supabase = createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) redirect("/login");

  const [{ data: profile }, { data: app }] = await Promise.all([
    supabase.from("profiles").select("plan, full_name").eq("id", user.id).single(),
    supabase
      .from("apps")
      .select("id, user_id, name, status, deploy_url")
      .eq("id", params.appId)
      .eq("user_id", user.id)
      .single(),
  ]);

  if (!app) redirect("/dashboard");
  if (app.status !== "deployed" || !app.deploy_url) redirect("/dashboard");

  const SCHEMA = `app_${params.appId.slice(0, 8)}`;
  const tenantClient = createTenantServiceClient(SCHEMA);

  type SiteSettings = {
    logo_url: string | null;
    social_links: Record<string, string>;
    primary_color?: string | null;
    background_color?: string | null;
    gallery_photos?: string[];
  };
  let settings: SiteSettings | null = null;
  let unavailable = false;
  let colorsUnavailable = false;
  let galleryUnavailable = false;

  const result = await loadSiteSettingsCascade(tenantClient);
  if (result.status === "unavailable") {
    unavailable = true;
  } else if (result.status === "error") {
    console.error(`[apps/settings] failed to load site_settings for ${SCHEMA}:`, result.message);
    unavailable = true;
  } else {
    settings = result.settings as SiteSettings;
    colorsUnavailable = result.colorsUnavailable;
    galleryUnavailable = result.galleryUnavailable;
  }

  return (
    <SettingsClient
      appId={params.appId}
      appName={app.name}
      userId={user.id}
      userName={profile?.full_name ?? null}
      userEmail={user.email ?? null}
      plan={(profile?.plan ?? "free") as "free" | "starter" | "growth" | "pro"}
      initialSettings={settings}
      unavailable={unavailable}
      colorsUnavailable={colorsUnavailable}
      galleryUnavailable={galleryUnavailable}
    />
  );
}
