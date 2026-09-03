import { redirect } from "next/navigation";
import { createServerClient, createTenantServiceClient } from "@/lib/supabase";
import { loadSiteSettingsCascade } from "@/lib/siteSettings";
import {
  AUTOMATION_SEND_LIMITS,
  AUTOMATION_SMS_LIMITS,
  currentAutomationPeriod,
} from "@/lib/automationLimits";
import { CHANGE_REQUEST_LIMITS, monthStartISO } from "@/lib/apps/changeRequestLimits";
import { categoryTakesPayments } from "@/lib/apps/payments";
import type { Plan } from "@/lib/database.types";
import SettingsClient from "./SettingsClient";
import type { RevisionRow } from "./RequestChangePanel";

export default async function AppSettingsPage(
  props: {
    params: Promise<{ appId: string }>;
  }
) {
  const params = await props.params;
  const supabase = await createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) redirect("/login");

  const period = currentAutomationPeriod();
  const [
    { data: profile },
    { data: app },
    { data: workflows },
    { data: usage },
    { data: revisionRows },
    { count: changeRequestsUsed },
  ] = await Promise.all([
    supabase.from("profiles").select("plan, full_name").eq("id", user.id).single(),
    supabase
      .from("apps")
      .select("id, user_id, name, status, deploy_url, category, payments_status")
      .eq("id", params.appId)
      .eq("user_id", user.id)
      .single(),
    supabase
      .from("automation_workflows")
      .select("id, app_id, trigger_type, action_type, enabled, channel, created_at, updated_at")
      .eq("app_id", params.appId),
    supabase
      .from("automation_usage")
      .select("sent_count, sms_sent_count")
      .eq("user_id", user.id)
      .eq("period", period)
      .maybeSingle(),
    supabase
      .from("app_revisions")
      .select("id, kind, status, request_text, changelog, changed_files, error, created_at, deployed_at")
      .eq("app_id", params.appId)
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("app_revisions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("kind", "change")
      .gte("created_at", monthStartISO()),
  ]);

  if (!app) redirect("/dashboard");
  // Reachable while a change request is mid-rebuild (status flips to
  // "ready"/"deploying"); only bounce if the app was never deployed.
  if (!app.deploy_url) redirect("/dashboard");

  const plan = (profile?.plan ?? "free") as Plan;
  const automationUsage = {
    email: { sent: usage?.sent_count ?? 0, limit: AUTOMATION_SEND_LIMITS[plan] },
    sms: { sent: usage?.sms_sent_count ?? 0, limit: AUTOMATION_SMS_LIMITS[plan] },
  };
  const changeQuota = {
    used: changeRequestsUsed ?? 0,
    limit: CHANGE_REQUEST_LIMITS[plan],
  };
  const initialRevisions = (revisionRows ?? []) as RevisionRow[];

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
      appStatus={app.status}
      initialRevisions={initialRevisions}
      changeQuota={changeQuota}
      paymentsApplicable={categoryTakesPayments(app.category)}
      initialPaymentsStatus={app.payments_status}
      unavailable={unavailable}
      colorsUnavailable={colorsUnavailable}
      galleryUnavailable={galleryUnavailable}
    />
  );
}
