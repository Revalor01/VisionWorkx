import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase";
import BillingClient from "./BillingClient";
import AppNavbar from "@/components/nav/AppNavbar";

const TRIAL_DAYS = 14;

function BillingSkeleton() {
  return (
    <div className="min-h-screen bg-off-white flex flex-col">
      <AppNavbar userName={null} plan="free" />
      <main className="max-w-5xl mx-auto w-full px-4 py-10 space-y-6">
        <div className="h-8 w-48 bg-gray-200 rounded-xl animate-pulse" />
        <div className="h-28 bg-white rounded-2xl border border-gray-100 animate-pulse" />
        <div className="grid grid-cols-3 gap-5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-64 bg-white rounded-2xl border border-gray-100 animate-pulse" />
          ))}
        </div>
      </main>
    </div>
  );
}

export default async function BillingPage() {
  const supabase = createServerClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) redirect("/login");

  const [{ data: profile }, { data: subscription }, { count: appCount }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("plan, created_at, full_name")
        .eq("id", user.id)
        .single(),
      supabase
        .from("subscriptions")
        .select("plan, status, current_period_end, stripe_customer_id")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("apps")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id),
    ]);

  // Compute trial days remaining
  const createdAt = profile?.created_at ? new Date(profile.created_at) : null;
  const trialEnd = createdAt
    ? new Date(createdAt.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000)
    : null;
  const trialMsLeft = trialEnd ? trialEnd.getTime() - Date.now() : 0;
  const trialDaysLeft = Math.max(
    0,
    Math.ceil(trialMsLeft / (1000 * 60 * 60 * 24))
  );
  const isInTrial = trialDaysLeft > 0 && !subscription?.status;

  // Price IDs are server-side env vars — pass them as props so the client
  // doesn't need NEXT_PUBLIC_ access to these non-secret values
  const priceIds = {
    starter: process.env.STRIPE_STARTER_PRICE_ID ?? "",
    growth: process.env.STRIPE_GROWTH_PRICE_ID ?? "",
    pro: process.env.STRIPE_PRO_PRICE_ID ?? "",
  };

  return (
    <Suspense fallback={<BillingSkeleton />}>
      <BillingClient
        profile={{
          plan: profile?.plan ?? "free",
          fullName: profile?.full_name ?? null,
          email: user.email ?? null,
        }}
        subscription={
          subscription
            ? {
                plan: subscription.plan ?? null,
                status: subscription.status ?? null,
                currentPeriodEnd: subscription.current_period_end ?? null,
                hasStripeCustomer: !!subscription.stripe_customer_id,
              }
            : null
        }
        appCount={appCount ?? 0}
        trialDaysLeft={trialDaysLeft}
        isInTrial={isInTrial}
        priceIds={priceIds}
      />
    </Suspense>
  );
}
