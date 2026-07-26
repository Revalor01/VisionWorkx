import { redirect } from "next/navigation";
import Link from "next/link";
import { createServerClient, createServiceClient } from "@/lib/supabase";
import AppNavbar from "@/components/nav/AppNavbar";
import AgreementView from "@/components/partners/AgreementView";
import AcceptAgreementButton from "@/components/partners/AcceptAgreementButton";
import PartnerDashboardClient from "@/components/partners/PartnerDashboardClient";

export default async function PartnerPage() {
  const supabase = createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) redirect("/login?next=/partner");

  const service = createServiceClient();

  const { data: profile } = await service
    .from("profiles")
    .select("plan, full_name")
    .eq("id", user.id)
    .single();

  const APPLICATION_COLUMNS =
    "id, business_name, status, agreement_terms, agreement_accepted_at, referral_code, completed_promotional_actions, converted_referral_count, referral_bonus_discount_percentage";

  let { data: application } = await service
    .from("partner_applications")
    .select(APPLICATION_COLUMNS)
    .eq("account_user_id", user.id)
    .maybeSingle();

  if (!application && user.email) {
    const { data: unlinked } = await service
      .from("partner_applications")
      .select(APPLICATION_COLUMNS)
      .eq("email", user.email)
      .eq("status", "approved")
      .is("account_user_id", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (unlinked) {
      await service
        .from("partner_applications")
        .update({ account_user_id: user.id, updated_at: new Date().toISOString() })
        .eq("id", unlinked.id);
      application = unlinked;
    }
  }

  let referrals: { id: string; referred_business_name: string; status: string; created_at: string }[] = [];
  if (application?.agreement_accepted_at) {
    const { data } = await service
      .from("partner_referrals")
      .select("id, referred_business_name, status, created_at")
      .eq("partner_application_id", application.id)
      .order("created_at", { ascending: false });
    referrals = data ?? [];
  }

  return (
    <div className="min-h-screen bg-off-white flex flex-col">
      <AppNavbar userName={profile?.full_name ?? null} plan={profile?.plan ?? "free"} userEmail={user.email} />

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-12">
        {!application ? (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 text-center">
            <h1 className="text-xl font-bold text-navy-dark mb-2">No partner application found</h1>
            <p className="text-gray-500 text-sm mb-6">
              We couldn&apos;t find an approved partnership application for {user.email}.
            </p>
            <Link
              href="/partners"
              className="inline-block bg-navy-dark text-white font-semibold px-6 py-3 rounded-xl hover:bg-navy transition-colors"
            >
              Apply to Partner With VisionWorkx
            </Link>
          </div>
        ) : !application.agreement_terms ? (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 text-center">
            <h1 className="text-xl font-bold text-navy-dark mb-2">Your agreement is being prepared</h1>
            <p className="text-gray-500 text-sm">Check back shortly — we&apos;ll email you once it&apos;s ready.</p>
          </div>
        ) : !application.agreement_accepted_at ? (
          <div className="space-y-6">
            <div className="text-center">
              <h1 className="text-2xl font-bold text-navy-dark mb-1">Your Partnership Agreement</h1>
              <p className="text-gray-500 text-sm">{application.business_name}</p>
            </div>
            <AgreementView terms={application.agreement_terms} />
            <AcceptAgreementButton />
          </div>
        ) : (
          <PartnerDashboardClient
            businessName={application.business_name}
            agreementTerms={application.agreement_terms}
            agreementAcceptedAt={application.agreement_accepted_at}
            referralCode={application.referral_code}
            completedPromotionalActions={application.completed_promotional_actions}
            convertedReferralCount={application.converted_referral_count}
            referralBonusDiscountPercentage={application.referral_bonus_discount_percentage}
            initialReferrals={referrals}
          />
        )}
      </main>
    </div>
  );
}
