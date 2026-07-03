import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase";
import DashboardClient from "./DashboardClient";
import type { App } from "@/lib/database.types";

export default async function DashboardPage() {
  const supabase = createServerClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) redirect("/login");

  const [{ data: profile }, { data: apps }] = await Promise.all([
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
  ]);

  return (
    <DashboardClient
      userId={user.id}
      profile={{
        plan: profile?.plan ?? "free",
        fullName: profile?.full_name ?? null,
        companyName: profile?.company_name ?? null,
        createdAt: profile?.created_at ?? new Date().toISOString(),
      }}
      initialApps={(apps ?? []) as App[]}
    />
  );
}
