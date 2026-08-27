import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase";
import NotificationsClient from "./NotificationsClient";
import AppNavbar from "@/components/nav/AppNavbar";

function NotificationsSkeleton() {
  return (
    <div className="min-h-screen bg-off-white flex flex-col">
      <AppNavbar userName={null} plan="free" />
      <main className="max-w-2xl mx-auto w-full px-4 py-10">
        <div className="h-8 w-48 bg-gray-200 rounded-xl animate-pulse mb-6" />
        <div className="h-64 bg-white rounded-2xl border border-gray-100 animate-pulse" />
      </main>
    </div>
  );
}

export default async function NotificationsPage() {
  const supabase = await createServerClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) redirect("/login");

  const [{ data: profile }, { data: optIn }] = await Promise.all([
    supabase.from("profiles").select("plan, full_name").eq("id", user.id).single(),
    supabase.from("sms_opt_ins").select("*").eq("user_id", user.id).maybeSingle(),
  ]);

  return (
    <Suspense fallback={<NotificationsSkeleton />}>
      <NotificationsClient
        userName={profile?.full_name ?? null}
        plan={profile?.plan ?? "free"}
        userEmail={user.email ?? null}
        initialOptIn={optIn ? { phone: optIn.phone, consentedAt: optIn.consented_at } : null}
      />
    </Suspense>
  );
}
