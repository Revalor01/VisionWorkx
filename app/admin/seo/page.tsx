import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createServerClient, createServiceClient } from "@/lib/supabase";
import { ADMIN_SSO_COOKIE, ADMIN_EMAIL, verifySessionCookie } from "@/lib/adminSso";
import SeoDashboard from "./SeoDashboard";

export default async function AdminSeoPage() {
  const supabase = createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  const cookieStore = cookies();
  const isSsoAdmin = verifySessionCookie(cookieStore.get(ADMIN_SSO_COOKIE)?.value, ADMIN_EMAIL);
  const isRealAdmin = !authError && !!user && user.email === ADMIN_EMAIL;
  if (!isRealAdmin && !isSsoAdmin) redirect("/dashboard");

  const service = createServiceClient();

  const [{ data: posts }, { data: keywords }, { data: runLog }] = await Promise.all([
    service.from("blog_posts").select("*").order("created_at", { ascending: false }).limit(100),
    service
      .from("blog_keywords")
      .select("*")
      .eq("used", false)
      .order("discovered_at", { ascending: false })
      .limit(100),
    service.from("blog_run_log").select("*").order("run_at", { ascending: false }).limit(30),
  ]);

  return <SeoDashboard initialPosts={posts ?? []} initialKeywords={keywords ?? []} runLog={runLog ?? []} />;
}
