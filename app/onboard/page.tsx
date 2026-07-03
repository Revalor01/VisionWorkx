import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase";
import OnboardForm from "./OnboardForm";

const PLAN_APP_LIMITS: Record<string, number> = {
  free: 1,
  starter: 1,
  growth: 3,
  pro: Infinity,
};

export default async function OnboardPage() {
  const supabase = createServerClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) redirect("/login");

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

  if (limit === 0) redirect("/billing");
  if (appCount !== null && limit !== Infinity && appCount >= limit) {
    redirect("/billing");
  }

  return (
    <OnboardForm
      userId={user.id}
      userName={profile?.full_name ?? null}
      plan={plan as "free" | "starter" | "growth" | "pro"}
    />
  );
}
