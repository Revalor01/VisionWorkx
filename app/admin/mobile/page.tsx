import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createServerClient, createServiceClient } from "@/lib/supabase";
import { ADMIN_EMAIL, ADMIN_SSO_COOKIE, verifySessionCookie } from "@/lib/adminSso";
import MobileDashboard from "./MobileDashboard";

export default async function AdminMobilePage() {
  const supabase = await createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  const cookieStore = await cookies();
  const isSsoAdmin = verifySessionCookie(cookieStore.get(ADMIN_SSO_COOKIE)?.value, ADMIN_EMAIL);

  if (!isSsoAdmin && (authError || !user || user.email !== ADMIN_EMAIL)) redirect("/dashboard");

  const service = createServiceClient();
  const { data: campaigns } = await service
    .from("marketing_campaigns")
    .select("*")
    .in("channel", ["push", "sms"])
    .order("created_at", { ascending: false })
    .limit(50);

  return <MobileDashboard initialCampaigns={campaigns ?? []} />;
}
