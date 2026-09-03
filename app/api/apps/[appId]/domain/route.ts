import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createServiceClient } from "@/lib/supabase";
import { addDomain, getDomainStatus, removeDomain, isValidDomain } from "@/lib/apps/domains";
import type { Plan } from "@/lib/database.types";

export const runtime = "nodejs";

async function ownApp(appId: string, userId: string) {
  const service = createServiceClient();
  const [{ data: app }, { data: profile }] = await Promise.all([
    service
      .from("apps")
      .select("id, user_id, name, deploy_url, vercel_project_id, custom_domain")
      .eq("id", appId)
      .single(),
    service.from("profiles").select("plan").eq("id", userId).single(),
  ]);
  if (!app || app.user_id !== userId) return null;
  return { app, plan: (profile?.plan ?? "free") as Plan };
}

function projectRef(app: { vercel_project_id: string | null; name: string; id: string }): string {
  if (app.vercel_project_id) return app.vercel_project_id;
  const base =
    app.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 30) || "app";
  return `vw-${base}-${app.id.slice(0, 8)}`;
}

// GET — current custom domain + DNS records + verified status.
export async function GET(
  _req: NextRequest,
  props: { params: Promise<{ appId: string }> },
) {
  const { appId } = await props.params;
  const supabase = await createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const owned = await ownApp(appId, user.id);
  if (!owned) return NextResponse.json({ error: "App not found" }, { status: 404 });
  if (!owned.app.custom_domain) return NextResponse.json({ domain: null });

  try {
    const status = await getDomainStatus(projectRef(owned.app), owned.app.custom_domain);
    return NextResponse.json(status);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}

// POST { domain } — attach a domain (Growth+). Returns DNS records to set.
export async function POST(
  req: NextRequest,
  props: { params: Promise<{ appId: string }> },
) {
  const { appId } = await props.params;
  const supabase = await createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const owned = await ownApp(appId, user.id);
  if (!owned) return NextResponse.json({ error: "App not found" }, { status: 404 });
  if (!owned.app.deploy_url) {
    return NextResponse.json({ error: "This app isn't live yet." }, { status: 409 });
  }
  if (owned.plan !== "growth" && owned.plan !== "pro") {
    return NextResponse.json(
      { error: "Custom domains are on the Growth and Pro plans." },
      { status: 403 },
    );
  }

  let body: { domain?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const domain = (body.domain ?? "").trim().toLowerCase();
  if (!isValidDomain(domain)) {
    return NextResponse.json({ error: "Enter a valid domain, e.g. shop.yourbusiness.com" }, { status: 400 });
  }

  try {
    const status = await addDomain(projectRef(owned.app), domain);
    await createServiceClient()
      .from("apps")
      .update({ custom_domain: domain })
      .eq("id", appId);
    return NextResponse.json(status);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}

// DELETE — detach the custom domain.
export async function DELETE(
  _req: NextRequest,
  props: { params: Promise<{ appId: string }> },
) {
  const { appId } = await props.params;
  const supabase = await createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const owned = await ownApp(appId, user.id);
  if (!owned) return NextResponse.json({ error: "App not found" }, { status: 404 });

  if (owned.app.custom_domain) {
    try {
      await removeDomain(projectRef(owned.app), owned.app.custom_domain);
    } catch {
      /* best-effort; still clear our record */
    }
  }
  await createServiceClient().from("apps").update({ custom_domain: null }).eq("id", appId);
  return NextResponse.json({ domain: null });
}
