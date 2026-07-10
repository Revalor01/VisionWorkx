import { redirect } from "next/navigation";
import { createServerClient, createServiceClient } from "@/lib/supabase";
import { ADMIN_EMAIL, isAdminOrEditor } from "@/lib/social/authGuard";
import SocialDashboard from "./SocialDashboard";

export default async function AdminSocialPage() {
  const supabase = createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) redirect("/dashboard");

  const isAdmin = user.email === ADMIN_EMAIL;
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
