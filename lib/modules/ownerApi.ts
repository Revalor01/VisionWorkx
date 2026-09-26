import { NextResponse } from "next/server";
import { modulesConfigured, modulesServerClient } from "./supabase";

// For /api/workspace/[slug]/... routes that change things only owners may
// change. Membership + role come from the member's own session (RLS), so a
// non-member can't even learn the workspace exists.
export async function requireOwner(slug: string) {
  if (!modulesConfigured()) return { error: NextResponse.json({ error: "Not available" }, { status: 503 }) };
  const supabase = await modulesServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Sign in first." }, { status: 401 }) };
  const { data: ws } = await supabase
    .from("vw_workspaces")
    .select("id, name, slug, domains")
    .eq("slug", slug)
    .maybeSingle();
  if (!ws) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  const { data: m } = await supabase
    .from("vw_workspace_members")
    .select("role")
    .eq("workspace_id", ws.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (m?.role !== "owner") return { error: NextResponse.json({ error: "Only workspace owners can do that." }, { status: 403 }) };
  return { user, workspace: ws as { id: string; name: string; slug: string; domains: string[] } };
}
