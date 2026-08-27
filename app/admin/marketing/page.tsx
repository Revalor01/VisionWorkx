import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createServerClient, createServiceClient } from "@/lib/supabase";
import { ADMIN_EMAIL, ADMIN_SSO_COOKIE, verifySessionCookie } from "@/lib/adminSso";
import MarketingDashboard from "./MarketingDashboard";

export default async function AdminMarketingPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  const cookieStore = await cookies();
  const isSsoAdmin = verifySessionCookie(cookieStore.get(ADMIN_SSO_COOKIE)?.value, ADMIN_EMAIL);

  if (!isSsoAdmin && (authError || !user || user.email !== ADMIN_EMAIL)) redirect("/dashboard");

  const service = createServiceClient();
  const [{ data: campaigns }, { data: schedules }] = await Promise.all([
    service.from("marketing_campaigns").select("*").eq("channel", "email").order("created_at", { ascending: false }).limit(50),
    service.from("marketing_recurring_schedules").select("*").order("next_run_at", { ascending: true }),
  ]);

  return <MarketingDashboard initialCampaigns={campaigns ?? []} initialSchedules={schedules ?? []} />;
}
