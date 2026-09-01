import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createServerClient, createServiceClient } from "@/lib/supabase";
import { ADMIN_EMAIL, isAdminOrEditor } from "@/lib/social/authGuard";
import { ADMIN_SSO_COOKIE, verifySessionCookie } from "@/lib/adminSso";
import SocialDashboard from "./SocialDashboard";
import type { VideoJobCalendarRow } from "./CalendarTab";

export default async function AdminSocialPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  const cookieStore = await cookies();
  const isSsoAdmin = verifySessionCookie(cookieStore.get(ADMIN_SSO_COOKIE)?.value, ADMIN_EMAIL);

  if (!isSsoAdmin && (authError || !user)) redirect("/dashboard");

  const isAdmin = isSsoAdmin || user?.email === ADMIN_EMAIL;
  const allowed = isAdmin || (await isAdminOrEditor(user));
  if (!allowed) redirect("/dashboard");

  const service = createServiceClient();

  const [
    { data: brands },
    { data: content },
    { data: videoAssets },
    { data: inboxItems },
    { data: blogPosts },
    { data: campaigns },
    { data: videoJobs },
    { data: linkedInPosts },
  ] = await Promise.all([
    service.from("social_brands").select("*").order("name"),
    service.from("social_content").select("*").order("created_at", { ascending: false }),
    service.from("social_video_assets").select("*").order("created_at", { ascending: false }),
    service.from("social_inbox_items").select("*").order("created_at", { ascending: false }),
    service.from("blog_posts").select("id, product, title, status, auto_published, created_at, published_at").order("created_at", { ascending: false }),
    service.from("marketing_campaigns").select("id, product, channel, subject, status, created_at, sent_at, run_at").order("created_at", { ascending: false }),
    // video_jobs lives in this same Supabase project but belongs to the
    // separate revalor-video repo, so it was never included in this repo's
    // generated Database types - cast the table name to read it anyway.
    service
      .from("video_jobs" as never)
      .select("id, topic, product, status, created_at, completed_at, published_at, youtube_url")
      .order("created_at", { ascending: false }) as unknown as Promise<{ data: VideoJobCalendarRow[] | null }>,
    service.from("linkedin_posts").select("*").order("created_at", { ascending: false }),
  ]);

  return (
    <SocialDashboard
      isAdmin={isAdmin}
      initialBrands={brands ?? []}
      initialContent={content ?? []}
      initialVideoAssets={videoAssets ?? []}
      initialInboxItems={inboxItems ?? []}
      initialBlogPosts={blogPosts ?? []}
      initialCampaigns={campaigns ?? []}
      initialVideoJobs={videoJobs ?? []}
      initialLinkedInPosts={linkedInPosts ?? []}
    />
  );
}
