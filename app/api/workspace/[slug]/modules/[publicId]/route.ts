import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/modules/ownerApi";
import { modulesServiceClient } from "@/lib/modules/supabase";
import { parseFormConfig } from "@/lib/modules/config";
import { billingAllowsService } from "@/lib/modules/plans";

// Owners edit a form's name/config or publish/pause it.
export async function PATCH(req: NextRequest, props: { params: Promise<{ slug: string; publicId: string }> }) {
  const { slug, publicId } = await props.params;
  const auth = await requireOwner(slug);
  if ("error" in auth) return auth.error;
  let body: { name?: unknown; config?: unknown; status?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const patch: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim().slice(0, 120);
  if (body.config !== undefined) {
    const config = parseFormConfig(body.config);
    if (config.fields.length === 0) return NextResponse.json({ error: "Add at least one field." }, { status: 400 });
    patch.config = config;
  }
  if (body.status !== undefined) {
    if (!["draft", "live", "paused"].includes(body.status as string)) return NextResponse.json({ error: "Bad status" }, { status: 400 });
    if (body.status === "live" && !billingAllowsService(auth.workspace.billing_status)) {
      return NextResponse.json({ error: "Start your 14-day free trial on the Billing page to publish forms." }, { status: 402 });
    }
    if (body.status === "live" && auth.workspace.domains.length === 0) {
      return NextResponse.json({ error: "Add your website in Settings first — forms only load on your own site." }, { status: 400 });
    }
    patch.status = body.status;
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "Nothing to change" }, { status: 400 });

  const { data, error } = await modulesServiceClient()
    .from("vw_modules")
    .update(patch)
    .eq("public_id", publicId)
    .eq("workspace_id", auth.workspace.id) // never touch another workspace's module
    .select("public_id, status")
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Couldn't save." }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, status: data.status });
}
