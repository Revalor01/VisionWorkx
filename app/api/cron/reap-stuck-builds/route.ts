import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { notifyBuildFailure } from "@/lib/apps/operatorAlert";
import { operatorAlertTitle } from "@/lib/apps/buildFailure";

export const runtime = "nodejs";
export const maxDuration = 60;

// A generation that runs past the 900s function ceiling is hard-killed —
// its own catch never runs, so the app sits in `generating`/`ready`
// forever and neither the customer nor the operator is told. This sweeps
// those up: past the threshold for its state, mark it failed
// (failure_reason 'timeout') and fire the operator alert.
//
// generating/ready : 18 min  (900s limit + margin)
// deploying         : 25 min  (Vercel build poll can legitimately be long)
const THRESHOLD_MIN: Record<string, number> = {
  generating: 18,
  ready: 18,
  deploying: 25,
};

export async function GET(req: NextRequest) {
  if ((req.headers.get("authorization") ?? "") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = createServiceClient();
  const { data: rows } = await service
    .from("apps")
    .select("id, name, status, user_id, preview_email, created_at")
    .in("status", ["generating", "ready", "deploying"]);

  const now = Date.now();
  const stuck = (rows ?? []).filter((a) => {
    const mins = (now - new Date(a.created_at).getTime()) / 60000;
    return mins >= (THRESHOLD_MIN[a.status] ?? 18);
  });

  for (const a of stuck) {
    await service
      .from("apps")
      .update({ status: "failed", failure_reason: "timeout" })
      .eq("id", a.id)
      .in("status", ["generating", "ready", "deploying"]); // guard against a race
    await notifyBuildFailure({
      stage: a.status === "deploying" ? "deploy" : "generate",
      appId: a.id,
      appName: a.name,
      customer: a.preview_email ?? (a.user_id ? `user ${a.user_id}` : null),
      error: `Stuck in "${a.status}" for over ${THRESHOLD_MIN[a.status] ?? 18} min — reaped by the stuck-build sweep. Almost always the 900s function timeout on an over-large build.`,
      title: operatorAlertTitle("timeout"),
    });
  }

  return NextResponse.json({ checked: rows?.length ?? 0, reaped: stuck.map((s) => s.id) });
}
