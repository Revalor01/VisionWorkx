import { redirect } from "next/navigation";
import { createServerClient, createTenantServiceClient } from "@/lib/supabase";
import { loadSiteSettingsCascade } from "@/lib/siteSettings";
import { AUTOMATION_SEND_LIMITS, currentAutomationPeriod } from "@/lib/automationLimits";
import type { Plan } from "@/lib/database.types";
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

  const period = currentAutomationPeriod();
  const [{ data: profile }, { data: app }, { data: workflows }, { data: usage }] =
    await Promise.all([
      supabase.from("profiles").select("plan, full_name").eq("id", user.id).single(),
      supabase
        .from("apps")
        .select("id, user_id, name, status, deploy_url, category")
        .eq("id", params.appId)
        .eq("user_id", user.id)
        .single(),
      supabase
        .from("automation_workflows")
        .select("id, app_id, trigger_type, action_type, enabled, created_at, updated_at")
        .eq("app_id", params.appId),
      supabase
        .from("automation_usage")
        .select("sent_count")
        .eq("user_id", user.id)
        .eq("period", period)
        .maybeSingle(),
    ]);

  if (!app) redirect("/dashboard");
  if (app.status !== "deployed" || !app.deploy_url) redirect("/dashboard");

  const plan = (profile?.plan ?? "free") as Plan;
  const automationUsage = {
    sent: usage?.sent_count ?? 0,
    limit: AUTOMATION_SEND_LIMITS[plan],
  };

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
      appCategory={app.category}
      userId={user.id}
      userName={profile?.full_name ?? null}
      userEmail={user.email ?? null}
      plan={plan}
      initialSettings={settings}
      initialWorkflows={workflows ?? []}
      automationUsage={automationUsage}
      unavailable={unavailable}
      colorsUnavailable={colorsUnavailable}
      galleryUnavailable={galleryUnavailable}
    />
  );
}
