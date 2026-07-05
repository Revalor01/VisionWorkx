import { redirect } from "next/navigation";
import { createServerClient, createServiceClient } from "@/lib/supabase";
import AdminDashboard from "./AdminDashboard";

const ADMIN_EMAIL = "sawilliams721@gmail.com";

export default async function AdminPage() {
  const supabase = createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user || user.email !== ADMIN_EMAIL) redirect("/dashboard");

  const service = createServiceClient();

  // Fetch all data in parallel
  const [
    { data: apps },
    { data: profiles },
    { data: subscriptions },
  ] = await Promise.all([
    service
      .from("apps")
      .select("id, user_id, name, category, status, deploy_url, created_at, intake_data")
      .order("created_at", { ascending: false }),
    service
      .from("profiles")
      .select("id, full_name, company_name, plan, created_at")
      .order("created_at", { ascending: false }),
    service
      .from("subscriptions")
      .select("user_id, plan, status, current_period_end, stripe_subscription_id"),
  ]);

  // Fetch user emails directly from auth.users via SQL
  let userEmails: Record<string, string> = {};
  try {
    const mgmtToken = process.env.SUPABASE_MANAGEMENT_TOKEN;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const ref = new URL(supabaseUrl).hostname.split(".")[0];
    if (mgmtToken) {
      const res = await fetch(
        `https://api.supabase.com/v1/projects/${ref}/database/query`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${mgmtToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ query: "SELECT id, email FROM auth.users" }),
        }
      );
      if (res.ok) {
        const rows: { id: string; email: string }[] = await res.json();
        userEmails = Object.fromEntries(rows.map((r) => [r.id, r.email]));
      }
    }
  } catch { /* non-fatal */ }

  return (
    <AdminDashboard
      apps={apps ?? []}
      profiles={profiles ?? []}
      subscriptions={subscriptions ?? []}
      userEmails={userEmails}
    />
  );
}
