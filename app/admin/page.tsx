import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createServerClient, createServiceClient } from "@/lib/supabase";
import { ADMIN_SSO_COOKIE, ADMIN_EMAIL, verifySessionCookie } from "@/lib/adminSso";
import LeadsPartnersDashboard from "./LeadsPartnersDashboard";

export default async function AdminPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  const cookieStore = await cookies();
  const isSsoAdmin = verifySessionCookie(cookieStore.get(ADMIN_SSO_COOKIE)?.value, ADMIN_EMAIL);
  const isRealAdmin = !authError && !!user && user.email === ADMIN_EMAIL;
  if (!isRealAdmin && !isSsoAdmin) redirect("/dashboard");

  const service = createServiceClient();

  // Leads, partner applications and partner referrals — the only sections
  // left after the pivot to VisionWorkx Modules (Modules has /admin/modules).
  const [{ data: leads }, { data: partners }, { data: referrals }] = await Promise.all([
    service.from("leads").select("*").order("final_score", { ascending: false }).limit(1000),
    service.from("partner_applications").select("*").order("created_at", { ascending: false }).limit(1000),
    service.from("partner_referrals").select("*").order("created_at", { ascending: false }).limit(1000),
  ]);

  return <LeadsPartnersDashboard initialLeads={leads ?? []} initialPartners={partners ?? []} initialReferrals={referrals ?? []} />;
}
