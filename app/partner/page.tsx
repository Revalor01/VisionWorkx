import { redirect } from "next/navigation";
import Link from "next/link";
import { createServerClient, createServiceClient } from "@/lib/supabase";
import AppNavbar from "@/components/nav/AppNavbar";
import AgreementView from "@/components/partners/AgreementView";
import AcceptAgreementButton from "@/components/partners/AcceptAgreementButton";

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

  let { data: application } = await service
    .from("partner_applications")
    .select("id, business_name, status, agreement_terms, agreement_accepted_at")
    .eq("account_user_id", user.id)
    .maybeSingle();

  if (!application && user.email) {
    const { data: unlinked } = await service
      .from("partner_applications")
      .select("id, business_name, status, agreement_terms, agreement_accepted_at")
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
        ) : (
          <div className="space-y-6">
            <div className="text-center">
              <h1 className="text-2xl font-bold text-navy-dark mb-1">Your Partnership Agreement</h1>
              <p className="text-gray-500 text-sm">{application.business_name}</p>
            </div>
            <AgreementView terms={application.agreement_terms} />
            {application.agreement_accepted_at ? (
              <p className="text-center text-sm text-green-600 font-medium">
                Accepted on {new Date(application.agreement_accepted_at).toLocaleDateString()}
              </p>
            ) : (
              <AcceptAgreementButton />
            )}
          </div>
        )}
      </main>
    </div>
  );
}
