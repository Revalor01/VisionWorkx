import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase";
import { AUTOMATION_SEND_LIMITS, currentAutomationPeriod } from "@/lib/automationLimits";
import DashboardClient from "./DashboardClient";
import type { App, AutomationWorkflow, Plan } from "@/lib/database.types";

export default async function DashboardPage() {
  const supabase = createServerClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) redirect("/login");

  const period = currentAutomationPeriod();
  const [{ data: profile }, { data: apps }, { data: workflows }, { data: usage }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("plan, full_name, company_name, created_at")
        .eq("id", user.id)
        .single(),
      supabase
        .from("apps")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
      // RLS scopes this to workflows on the user's own apps — no explicit
      // filter needed here, the policy does it.
      supabase.from("automation_workflows").select("*"),
      // RLS scopes this to the caller's own row (see migration 23).
      supabase
        .from("automation_usage")
        .select("sent_count")
        .eq("period", period)
        .maybeSingle(),
    ]);

  const plan = (profile?.plan ?? "free") as Plan;

  return (
    <DashboardClient
      userId={user.id}
      userEmail={user.email ?? null}
      profile={{
        plan,
        fullName: profile?.full_name ?? null,
        companyName: profile?.company_name ?? null,
        createdAt: profile?.created_at ?? new Date().toISOString(),
      }}
      initialApps={(apps ?? []) as App[]}
      initialWorkflows={(workflows ?? []) as AutomationWorkflow[]}
      automationUsage={{ sent: usage?.sent_count ?? 0, limit: AUTOMATION_SEND_LIMITS[plan] }}
    />
  );
}
