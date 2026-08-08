import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createServerClient, createServiceClient } from "@/lib/supabase";
import { ADMIN_EMAIL, isAdminOrEditor } from "@/lib/social/authGuard";
import { ADMIN_SSO_COOKIE, verifySessionCookie } from "@/lib/adminSso";
import SocialDashboard from "./SocialDashboard";

export default async function AdminSocialPage() {
  const supabase = createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  const cookieStore = cookies();
  const isSsoAdmin = verifySessionCookie(cookieStore.get(ADMIN_SSO_COOKIE)?.value, ADMIN_EMAIL);

  if (!isSsoAdmin && (authError || !user)) redirect("/dashboard");

  const isAdmin = isSsoAdmin || user?.email === ADMIN_EMAIL;
  const allowed = isAdmin || (await isAdminOrEditor(user));
  if (!allowed) redirect("/dashboard");

  const service = createServiceClient();

  const [{ data: brands }, { data: content }, { data: videoAssets }, { data: inboxItems }] = await Promise.all([
    service.from("social_brands").select("*").order("name"),
    service.from("social_content").select("*").order("created_at", { ascending: false }),
    service.from("social_video_assets").select("*").order("created_at", { ascending: false }),
    service.from("social_inbox_items").select("*").order("created_at", { ascending: false }),
  ]);

  return (
    <SocialDashboard
      isAdmin={isAdmin}
      initialBrands={brands ?? []}
      initialContent={content ?? []}
      initialVideoAssets={videoAssets ?? []}
      initialInboxItems={inboxItems ?? []}
    />
  );
}
