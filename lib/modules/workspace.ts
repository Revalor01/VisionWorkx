import { redirect, notFound } from "next/navigation";
import { modulesConfigured, modulesServerClient } from "./supabase";

export interface WorkspaceRow {
  id: string;
  name: string;
  slug: string;
  domains: string[];
  brand: Record<string, unknown>;
  logo_url: string | null;
  notification_email: string | null;
  time_zone: string;
  webhook_url: string | null;
  plan: string;
}

/**
 * Loads a workspace for the signed-in member (RLS does the real enforcement:
 * a non-member simply gets no row). Redirects to login when signed out.
 */
export async function requireWorkspace(slug: string) {
  if (!modulesConfigured()) redirect("/workspace/login");
  const supabase = await modulesServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/workspace/login?next=${encodeURIComponent(`/workspace/${slug}`)}`);

  const { data: ws } = await supabase
    .from("vw_workspaces")
    .select("id, name, slug, domains, brand, logo_url, notification_email, time_zone, webhook_url, plan")
    .eq("slug", slug)
    .maybeSingle();
  if (!ws) notFound();

  const { data: member } = await supabase
    .from("vw_workspace_members")
    .select("role")
    .eq("workspace_id", ws.id)
    .eq("user_id", user.id)
    .maybeSingle();

  return { supabase, user, workspace: ws as WorkspaceRow, role: (member?.role ?? "staff") as "owner" | "staff" };
}
