import { NextRequest, NextResponse } from "next/server";
import { modulesConfigured, modulesServerClient, modulesServiceClient } from "@/lib/modules/supabase";

// Owners only: the webhook signing secret isn't readable through RLS at all
// (column privilege), so it's fetched here after an owner check.
export async function GET(_req: NextRequest, props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  if (!modulesConfigured()) return NextResponse.json({ error: "Not available" }, { status: 503 });
  const supabase = await modulesServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { data: ws } = await supabase.from("vw_workspaces").select("id").eq("slug", slug).maybeSingle();
  if (!ws) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { data: m } = await supabase
    .from("vw_workspace_members")
    .select("role")
    .eq("workspace_id", ws.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (m?.role !== "owner") return NextResponse.json({ error: "Owners only." }, { status: 403 });
  const { data } = await modulesServiceClient().from("vw_workspaces").select("webhook_secret").eq("id", ws.id).single();
  return NextResponse.json({ secret: data?.webhook_secret ?? null }, { headers: { "Cache-Control": "no-store" } });
}
