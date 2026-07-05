import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase";
import OnboardForm from "./OnboardForm";
import type { IntakeData } from "@/lib/database.types";

const PLAN_APP_LIMITS: Record<string, number> = {
  free: 1,
  starter: 1,
  growth: 3,
  pro: Infinity,
};

export default async function OnboardPage({
  searchParams,
}: {
  searchParams: { edit?: string };
}) {
  const supabase = createServerClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) redirect("/login");

  const editAppId = searchParams.edit ?? null;

  let initialData: IntakeData | null = null;
  if (editAppId) {
    const { data: existingApp } = await supabase
      .from("apps")
      .select("id, user_id, intake_data")
      .eq("id", editAppId)
      .eq("user_id", user.id)
      .single();

    if (existingApp?.intake_data) {
      initialData = existingApp.intake_data;
    }
  }

  const [{ data: profile }, { count: appCount }] = await Promise.all([
    supabase
      .from("profiles")
      .select("plan, full_name")
      .eq("id", user.id)
      .single(),
    supabase
      .from("apps")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id),
  ]);

  const plan = profile?.plan ?? "free";
  const limit = PLAN_APP_LIMITS[plan] ?? 0;

  // Only gate on the plan's app limit when creating a new app — editing an
  // existing one doesn't add to the count.
  if (!initialData) {
    if (limit === 0) redirect("/billing");
    if (appCount !== null && limit !== Infinity && appCount >= limit) {
      redirect("/billing");
    }
  }

  return (
    <OnboardForm
      userId={user.id}
      userName={profile?.full_name ?? null}
      userEmail={user.email ?? null}
      plan={plan as "free" | "starter" | "growth" | "pro"}
      editAppId={initialData ? editAppId : null}
      initialData={initialData}
    />
  );
}
