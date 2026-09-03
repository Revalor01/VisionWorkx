import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase";
import { getInsights, rollupApp } from "@/lib/apps/insights";
import type { Plan } from "@/lib/database.types";
import InsightsClient from "./InsightsClient";

const WINDOWS = [7, 30, 90] as const;
type Window = (typeof WINDOWS)[number];

export default async function InsightsPage(props: {
  params: Promise<{ appId: string }>;
  searchParams: Promise<{ days?: string }>;
}) {
  const { appId } = await props.params;
  const { days: daysParam } = await props.searchParams;

  const supabase = await createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) redirect("/login");

  const [{ data: app }, { data: profile }] = await Promise.all([
    supabase
      .from("apps")
      .select("id, user_id, name, category, secondary_categories, deploy_url")
      .eq("id", appId)
      .eq("user_id", user.id)
      .single(),
    supabase.from("profiles").select("plan, full_name").eq("id", user.id).single(),
  ]);
  if (!app || !app.deploy_url) redirect("/dashboard");

  const days: Window = WINDOWS.includes(Number(daysParam) as Window)
    ? (Number(daysParam) as Window)
    : 30;

  const cats = [app.category, ...(app.secondary_categories ?? [])];
  let insights = await getInsights(appId, cats, days);
  // First visit before the nightly cron has run — pull the app's view live.
  if (!insights.hasData) {
    await rollupApp(appId, app.user_id!);
    insights = await getInsights(appId, cats, days);
  }

  return (
    <InsightsClient
      appId={appId}
      appName={app.name}
      days={days}
      windows={[...WINDOWS]}
      insights={insights}
      userName={profile?.full_name ?? null}
      userEmail={user.email ?? null}
      plan={(profile?.plan ?? "free") as Plan}
    />
  );
}
