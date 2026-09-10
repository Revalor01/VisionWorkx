import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { createPreviewApp, runPreviewGenerate } from "@/lib/apps/preview";
import { notifyBuildFailure } from "@/lib/apps/operatorAlert";
import type { IntakeData } from "@/lib/database.types";

export const runtime = "nodejs";
export const maxDuration = 60;

// Once a day: run a fixed minimal intake through the REAL generate ->
// deploy pipeline. Two jobs each run:
//   1. Grade the previous canary — if it didn't reach `deployed`, the
//      pipeline is broken for real customers too. Alert.
//   2. Fire a fresh canary and clean up old ones.
// The build runs async (preview path); tomorrow's run reads the verdict.
const CANARY_EMAIL = "canary@visionworkx.internal";

const CANARY_INTAKE: IntakeData = {
  businessName: "Canary Coffee",
  businessType: "Neighborhood coffee shop",
  location: "Austin, TX",
  description:
    "Customers book a table online and see opening hours. One simple admin list of bookings.",
  category: "booking",
  secondaryCategories: [],
  features: [],
  primaryColor: "#1A3A5C",
  backgroundColor: "#F8FAFC",
  font: "Inter",
};

export async function GET(req: NextRequest) {
  if ((req.headers.get("authorization") ?? "") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = createServiceClient();

  // 1. Grade the previous canary.
  const { data: prev } = await service
    .from("apps")
    .select("id, status, failure_reason, deploy_url, created_at")
    .eq("preview_email", CANARY_EMAIL)
    .order("created_at", { ascending: false })
    .limit(1);

  const last = prev?.[0];
  let verdict: string;
  if (!last) {
    verdict = "no previous canary";
  } else if (last.status === "deployed") {
    verdict = "pass";
  } else {
    const ageMin = (Date.now() - new Date(last.created_at).getTime()) / 60000;
    if (ageMin < 30 && (last.status === "generating" || last.status === "ready" || last.status === "deploying")) {
      verdict = `still running (${last.status}, ${Math.round(ageMin)}m)`;
    } else {
      verdict = `FAIL (${last.status}${last.failure_reason ? ` / ${last.failure_reason}` : ""})`;
      await notifyBuildFailure({
        stage: "canary",
        appId: last.id,
        appName: "Canary build",
        customer: null,
        error: `The daily canary build did not deploy — status "${last.status}"${
          last.failure_reason ? `, reason "${last.failure_reason}"` : ""
        }. The generate -> deploy pipeline is failing for real customers too.`,
        title: "🔴 CANARY BUILD FAILED — the build pipeline is down",
      });
    }
  }

  // 2. Clean up canaries older than 2 days (rows only; Vercel projects are
  // left — low volume, and deleting them needs the deploy token's scope).
  const cutoff = new Date(Date.now() - 2 * 86400_000).toISOString();
  await service
    .from("apps")
    .delete()
    .eq("preview_email", CANARY_EMAIL)
    .lt("created_at", cutoff);

  // 3. Fire a fresh canary (async — the build runs in /api/generate's
  // own invocation; tomorrow's run grades it).
  let fired: string | null = null;
  try {
    const { id } = await createPreviewApp(CANARY_EMAIL, CANARY_INTAKE, { skipDedup: true });
    void runPreviewGenerate(id);
    fired = id;
  } catch (err) {
    await notifyBuildFailure({
      stage: "canary",
      appId: "-",
      appName: "Canary build",
      customer: null,
      error: `Couldn't even start the canary: ${err instanceof Error ? err.message : String(err)}`,
      title: "🔴 CANARY couldn't start — check the pipeline",
    });
  }

  return NextResponse.json({ previousVerdict: verdict, firedCanary: fired });
}
