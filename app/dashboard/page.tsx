import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase";
import DashboardClient from "./DashboardClient";
import type { App, AutomationWorkflow } from "@/lib/database.types";

export default async function DashboardPage() {
  const supabase = createServerClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) redirect("/login");

  const [{ data: profile }, { data: apps }, { data: workflows }] = await Promise.all([
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
  ]);

  return (
    <DashboardClient
      userId={user.id}
      userEmail={user.email ?? null}
      profile={{
        plan: profile?.plan ?? "free",
        fullName: profile?.full_name ?? null,
        companyName: profile?.company_name ?? null,
        createdAt: profile?.created_at ?? new Date().toISOString(),
      }}
      initialApps={(apps ?? []) as App[]}
      initialWorkflows={(workflows ?? []) as AutomationWorkflow[]}
    />
  );
}
