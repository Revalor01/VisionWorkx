import { NextRequest, NextResponse } from "next/server";
import { getModuleByPublicId } from "@/lib/modules/data";
import { modulesConfigured } from "@/lib/modules/supabase";
import { corsHeaders, json, originAllowed } from "@/lib/modules/http";

// Public config for shadow-DOM mode (the embed renders the form directly in
// the host page instead of an iframe). Only visitor-facing fields.

export const runtime = "nodejs";

export async function OPTIONS(req: NextRequest, props: { params: Promise<{ moduleId: string }> }) {
  const { moduleId } = await props.params;
  if (!modulesConfigured()) return new NextResponse(null, { status: 204 });
  const mod = await getModuleByPublicId(moduleId);
  return new NextResponse(null, { status: 204, headers: corsHeaders(req, mod?.domains ?? []) });
}

export async function GET(req: NextRequest, props: { params: Promise<{ moduleId: string }> }) {
  const { moduleId } = await props.params;
  if (!modulesConfigured()) return NextResponse.json({ error: "Modules aren't set up yet." }, { status: 503 });
  const mod = await getModuleByPublicId(moduleId);
  if (!mod || mod.status !== "live") return NextResponse.json({ error: "Not available." }, { status: 404 });
  if (!originAllowed(req, mod.domains)) return json(req, mod.domains, { error: "Not allowed from this website." }, 403);
  return json(
    req,
    mod.domains,
    { type: mod.type, name: mod.workspaceName, logoUrl: mod.logoUrl, brand: mod.brand, config: mod.config },
    200,
    { "Cache-Control": "public, max-age=60" },
  );
}
