import type { Metadata } from "next";
import { redirect } from "next/navigation";
import OnboardingForm from "./OnboardingForm";
import { modulesConfigured, modulesServerClient, modulesServiceClient } from "@/lib/modules/supabase";
import { selfServeEnabled } from "@/lib/modules/selfServe";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Set up your workspace — VisionWorkx", robots: { index: false, follow: false } };

export default async function OnboardingPage() {
  if (!modulesConfigured()) redirect("/workspace/login");
  const supabase = await modulesServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/workspace/login?next=/workspace/onboarding");

  // Already set up? Straight to the workspace.
  const { data: own } = await modulesServiceClient()
    .from("vw_workspaces")
    .select("slug")
    .eq("created_by", user.id)
    .eq("self_serve", true)
    .maybeSingle();
  if (own) redirect(`/workspace/${own.slug}`);
  if (!selfServeEnabled()) redirect("/workspace");

  const meta = (user.user_metadata ?? {}) as Record<string, string>;
  return (
    <main className="min-h-screen bg-gray-50 px-4 py-16">
      <div className="mx-auto max-w-lg rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">VisionWorkx · Step 1 of 3</p>
        <h1 className="mt-1 mb-2 text-2xl font-bold text-navy-dark">Confirm your business details</h1>
        <p className="mb-6 text-sm text-gray-600">
          You&apos;re signed in as <strong>{user.email}</strong>. You can change any of this later in Settings.
        </p>
        <OnboardingForm
          initial={{
            businessName: meta.business_name ?? "",
            website: meta.website ?? "",
            notificationEmail: user.email ?? "",
            termsAccepted: !!meta.terms_accepted_at,
          }}
        />
      </div>
    </main>
  );
}
