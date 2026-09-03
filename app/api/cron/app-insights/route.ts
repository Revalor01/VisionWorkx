import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { rollupApp } from "@/lib/apps/insights";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_APPS_PER_RUN = 250;

// Nightly: snapshot every deployed app's own vw_metrics_daily view into
// app_metrics so the Insights dashboard reads platform-side history.
export async function GET(req: NextRequest) {
  if ((req.headers.get("authorization") ?? "") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: apps } = await createServiceClient()
    .from("apps")
    .select("id, user_id")
    .eq("status", "deployed")
    .order("created_at", { ascending: false })
    .limit(MAX_APPS_PER_RUN);

  let processed = 0;
  let withData = 0;
  for (const app of apps ?? []) {
    try {
      const n = await rollupApp(app.id, app.user_id);
      processed++;
      if (n > 0) withData++;
    } catch (err) {
      console.error(`[cron/app-insights] ${app.id} failed:`, err);
    }
  }

  return NextResponse.json({ processed, withData });
}
