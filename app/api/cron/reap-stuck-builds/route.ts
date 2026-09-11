import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { notifyBuildFailure } from "@/lib/apps/operatorAlert";
import { operatorAlertTitle } from "@/lib/apps/buildFailure";
import { DEFAULT_BUILD_NOTICE } from "@/lib/apps/clientStatus";

export const runtime = "nodejs";
export const maxDuration = 60;

// A build hard-killed at a function ceiling never runs its own catch, so
// the app sits in a non-terminal state forever with nobody told. This
// sweeps those up: past the threshold for its state, mark it failed
// (failure_reason 'timeout') and alert the operator.
//
// Thresholds are measured from apps.created_at and must cover the WORST
// legitimate path, not the average:
//   generating/ready : 30 min — one generate (<=15m) + the one automatic
//                      retry (<=15m).
//   deploying        : 40 min — deploy (<=13m) + one repair pass + the
//                      repair redeploy (<=13m).
const THRESHOLD_MIN: Record<string, number> = {
  generating: 30,
  ready: 30,
  deploying: 40,
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
      // A build reaped here never ran its own catch block, so it never got
      // the customer-facing build_notice either — without this it'd sit at
      // "failed" with the client-status panel showing no update at all,
      // silently breaking the "we'll update you here" promise.
      .update({
        status: "failed",
        failure_reason: "timeout",
        pending_generated_code: null,
        build_notice: DEFAULT_BUILD_NOTICE,
        build_notice_at: new Date().toISOString(),
      })
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
