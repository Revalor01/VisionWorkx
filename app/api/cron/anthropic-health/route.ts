import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServiceClient } from "@/lib/supabase";
import { notifyBuildFailure } from "@/lib/apps/operatorAlert";
import { classifyBuildError, operatorAlertTitle } from "@/lib/apps/buildFailure";

export const runtime = "nodejs";
export const maxDuration = 30;

// Hourly ~free probe of the Anthropic account the builder runs on. Catches
// credit exhaustion / auth / outage within the hour instead of when a
// customer's build fails. Alerts only on a state CHANGE (healthy->down and
// down->recovered), tracked in system_health.
const KEY = "anthropic_api";

export async function GET(req: NextRequest) {
  if ((req.headers.get("authorization") ?? "") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = createServiceClient();
  let ok = true;
  let detail = "ok";

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4,
      messages: [{ role: "user", content: "ping" }],
    });
  } catch (err) {
    ok = false;
    detail = err instanceof Error ? err.message : String(err);
  }

  const { data: prev } = await service
    .from("system_health")
    .select("ok")
    .eq("key", KEY)
    .maybeSingle();
  const wasOk = prev?.ok ?? true;

  await service
    .from("system_health")
    .upsert({ key: KEY, ok, detail: detail.slice(0, 500), updated_at: new Date().toISOString() });

  if (wasOk && !ok) {
    const reason = classifyBuildError(detail);
    await notifyBuildFailure({
      stage: "health",
      appId: "-",
      appName: "Anthropic API health check",
      customer: null,
      error: detail,
      title:
        operatorAlertTitle(reason) ??
        "🔴 Anthropic API health check FAILING — customer builds are down",
    });
  } else if (!wasOk && ok) {
    await notifyBuildFailure({
      stage: "health",
      appId: "-",
      appName: "Anthropic API health check",
      customer: null,
      error: "Recovered — the Anthropic API is responding again. Builds should work.",
      title: "✅ Anthropic API RECOVERED — builds are back",
    });
  }

  return NextResponse.json({ ok, changed: wasOk !== ok });
}
