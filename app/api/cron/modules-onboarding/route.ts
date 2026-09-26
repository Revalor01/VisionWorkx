import { NextRequest, NextResponse } from "next/server";
import { modulesConfigured, modulesServiceClient } from "@/lib/modules/supabase";
import { onboardingEmailOnce, sendInstallNudge } from "@/lib/modules/selfServe";

// Daily: one reminder to self-serve workspaces that signed up 2–7 days ago but
// have no live form yet (no submissions, no install request). Deduped per
// workspace in vw_usage_alerts, and the 5-day window keeps it to one email.
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || (req.headers.get("authorization") ?? "") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!modulesConfigured()) return NextResponse.json({ skipped: "modules DB not configured" });

  const db = modulesServiceClient();
  const now = Date.now();
  const { data: rows, error } = await db
    .from("vw_workspaces")
    .select("id, name, slug, notification_email")
    .eq("self_serve", true)
    .is("install_requested_at", null)
    .lte("created_at", new Date(now - 2 * 864e5).toISOString())
    .gte("created_at", new Date(now - 7 * 864e5).toISOString())
    .limit(200);
  if (error) {
    console.error("[modules-onboarding] lookup failed:", error.message);
    return NextResponse.json({ error: "lookup failed" }, { status: 500 });
  }

  let nudged = 0;
  for (const ws of rows ?? []) {
    if (!ws.notification_email) continue;
    const { count } = await db.from("vw_submissions").select("id", { count: "exact", head: true }).eq("workspace_id", ws.id);
    if ((count ?? 0) > 0) continue;
    await onboardingEmailOnce(ws.id, "install_nudge", async () => {
      await sendInstallNudge(ws.notification_email!, ws.name, ws.slug);
      nudged++;
    });
  }
  return NextResponse.json({ checked: rows?.length ?? 0, nudged });
}
