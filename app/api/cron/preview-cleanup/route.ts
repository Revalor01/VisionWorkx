import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 120;

const VERCEL_TOKEN = process.env.VERCEL_API_TOKEN;
const VERCEL_TEAM = process.env.VERCEL_TEAM_ID || null;
const MGMT_TOKEN = process.env.SUPABASE_MANAGEMENT_TOKEN;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_REF = new URL(SUPABASE_URL).hostname.split(".")[0];

function vercelUrl(path: string): string {
  const q = VERCEL_TEAM ? `?teamId=${encodeURIComponent(VERCEL_TEAM)}` : "";
  return `https://api.vercel.com${path}${q}`;
}

async function dropTenantSchema(appId: string) {
  if (!MGMT_TOKEN) return;
  await fetch(`https://api.supabase.com/v1/projects/${SUPABASE_REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${MGMT_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: `drop schema if exists "app_${appId.slice(0, 8)}" cascade` }),
  }).catch(() => {});
}

// Deletes previews past their 72h TTL that were never claimed: the Vercel
// project, the tenant schema, and the apps row.
export async function GET(req: NextRequest) {
  if ((req.headers.get("authorization") ?? "") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = createServiceClient();
  const { data: stale } = await service
    .from("apps")
    .select("id, vercel_project_id")
    .is("claimed_at", null)
    .not("preview_expires_at", "is", null)
    .lt("preview_expires_at", new Date().toISOString())
    .limit(200);

  let removed = 0;
  for (const app of stale ?? []) {
    if (app.vercel_project_id && VERCEL_TOKEN) {
      await fetch(vercelUrl(`/v9/projects/${app.vercel_project_id}`), {
        method: "DELETE",
        headers: { Authorization: `Bearer ${VERCEL_TOKEN}` },
      }).catch(() => {});
    }
    await dropTenantSchema(app.id);
    await service.from("apps").delete().eq("id", app.id);
    removed++;
  }

  return NextResponse.json({ removed });
}
