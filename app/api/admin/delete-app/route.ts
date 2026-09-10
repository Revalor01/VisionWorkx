import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createServiceClient } from "@/lib/supabase";
import { removeTenantSchema } from "@/lib/apps/tenantSchema";

export const runtime = "nodejs";
export const maxDuration = 30;

const ADMIN_EMAIL = "sawilliams721@gmail.com";
const VERCEL_TOKEN = process.env.VERCEL_API_TOKEN;
const VERCEL_TEAM = process.env.VERCEL_TEAM_ID || null;

function vercelProjectUrl(idOrName: string): string {
  const q = VERCEL_TEAM ? `?teamId=${encodeURIComponent(VERCEL_TEAM)}` : "";
  return `https://api.vercel.com/v9/projects/${encodeURIComponent(idOrName)}${q}`;
}

// Best-effort project name from a deploy_url like
//   https://vw-foo-bar-a1b2c3d4-9xh1k2l3m.vercel.app -> vw-foo-bar-a1b2c3d4
function projectNameFromDeployUrl(deployUrl: string | null): string | null {
  if (!deployUrl) return null;
  try {
    const base = new URL(deployUrl).hostname.replace(/\.vercel\.app$/, "");
    return base.replace(/-[a-z0-9]{9}$/, ""); // strip the per-deployment suffix
  } catch {
    return null;
  }
}

// Permanently delete one generated app: its Vercel project, its tenant
// Postgres schema (and its db_schema exposure entry), and its apps row.
// FKs with `on delete cascade` (automation_events / automation_workflows /
// automation_channels / app_revisions / app_metrics) clean up on the row
// delete. build_canary_runs.app_id and ai_usage_log.app_id have no FK —
// harmless dangling ids, kept for history.
export async function POST(req: NextRequest) {
  const supabase = await createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user || user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { appId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const appId = body.appId ?? "";
  if (!appId) {
    return NextResponse.json({ error: "Missing appId" }, { status: 400 });
  }

  const service = createServiceClient();
  const { data: app } = await service
    .from("apps")
    .select("id, name, vercel_project_id, deploy_url")
    .eq("id", appId)
    .maybeSingle();
  if (!app) {
    return NextResponse.json({ error: "App not found" }, { status: 404 });
  }

  // 1. Vercel project — try the stored id, then a name derived from the
  //    deploy_url. Non-fatal: an orphaned project is just a bit of clutter.
  const targets = [
    app.vercel_project_id,
    projectNameFromDeployUrl(app.deploy_url),
  ].filter((t): t is string => !!t);
  if (VERCEL_TOKEN) {
    for (const t of targets) {
      try {
        const res = await fetch(vercelProjectUrl(t), {
          method: "DELETE",
          headers: { Authorization: `Bearer ${VERCEL_TOKEN}` },
        });
        if (res.ok || res.status === 404) break;
      } catch {
        /* try the next target */
      }
    }
  }

  // 2. Tenant schema (unexpose from PostgREST first — hardened helper).
  await removeTenantSchema(appId);

  // 3. The apps row.
  const { error: delErr } = await service.from("apps").delete().eq("id", appId);
  if (delErr) {
    console.error("[api/admin/delete-app]", delErr.message);
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, name: app.name });
}
