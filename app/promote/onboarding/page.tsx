import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase";
import OnboardingWizard from "./OnboardingWizard";

export default async function PromoteOnboardingPage() {
  const supabase = createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) redirect("/login?next=/promote/onboarding");

  const { data: business } = await supabase
    .from("promote_businesses")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (business) redirect("/promote/dashboard");

  return <OnboardingWizard userId={user.id} />;
}
