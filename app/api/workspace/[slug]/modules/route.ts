import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/modules/ownerApi";
import { modulesServiceClient } from "@/lib/modules/supabase";
import { parseFormConfig } from "@/lib/modules/config";

// Owners create a new lead-capture form (saved as a draft). Module inserts
// are server-only by design (RLS), so this route checks ownership, then
// writes with the service role after sanitising the config.
export async function POST(req: NextRequest, props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const auth = await requireOwner(slug);
  if ("error" in auth) return auth.error;
  let body: { name?: unknown; config?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const config = parseFormConfig(body.config);
  if (config.fields.length === 0) return NextResponse.json({ error: "Add at least one field." }, { status: 400 });
  const name = (typeof body.name === "string" && body.name.trim() ? body.name.trim() : config.title || "Lead capture form").slice(0, 120);

  const db = modulesServiceClient();
  const { count } = await db.from("vw_modules").select("id", { count: "exact", head: true }).eq("workspace_id", auth.workspace.id);
  if ((count ?? 0) >= 25) return NextResponse.json({ error: "This workspace already has 25 modules." }, { status: 400 });

  const { data, error } = await db
    .from("vw_modules")
    .insert({ workspace_id: auth.workspace.id, type: "lead_capture", name, config, status: "draft" })
    .select("public_id")
    .single();
  if (error || !data) return NextResponse.json({ error: "Couldn't save the form." }, { status: 500 });
  return NextResponse.json({ ok: true, publicId: data.public_id });
}
