import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createServerClient, createServiceClient } from "@/lib/supabase";
import { ADMIN_EMAIL, ADMIN_SSO_COOKIE, verifySessionCookie } from "@/lib/adminSso";
import ContentDashboard from "./ContentDashboard";

export default async function AdminContentPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  const cookieStore = await cookies();
  const isSsoAdmin = verifySessionCookie(cookieStore.get(ADMIN_SSO_COOKIE)?.value, ADMIN_EMAIL);

  if (!isSsoAdmin && (authError || !user || user.email !== ADMIN_EMAIL)) redirect("/dashboard");

  const service = createServiceClient();
  const [{ data: items }, { data: topics }, { data: brands }] = await Promise.all([
    service.from("content_items").select("*").order("created_at", { ascending: false }).limit(50),
    service.from("content_topics").select("*").order("created_at", { ascending: false }),
    service.from("social_brands").select("id, name, slug").order("name", { ascending: true }),
  ]);

  return <ContentDashboard initialItems={items ?? []} initialTopics={topics ?? []} socialBrands={brands ?? []} />;
}
