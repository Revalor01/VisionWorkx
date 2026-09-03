import { NextRequest, NextResponse } from "next/server";
import { createServiceClient, createTenantServiceClient } from "@/lib/supabase";
import {
  AUTOMATION_SEND_LIMITS,
  AUTOMATION_SMS_LIMITS,
  currentAutomationPeriod,
} from "@/lib/automationLimits";
import { timeBasedAutomations } from "@/lib/apps/automations";
import { renderAutomationMessage } from "@/lib/apps/automationMessages";
import { sendAutomationEmail, sendAutomationSms } from "@/lib/apps/automationSend";
import type { AppCategory, Plan } from "@/lib/database.types";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_APPS_PER_RUN = 250;
const MAX_SENDS_PER_APP = 100;

interface DueRow {
  trigger_type: string;
  ref_id: string;
  recipient_email: string | null;
  recipient_phone: string | null;
  context: Record<string, unknown> | null;
}

// Hourly: for every deployed app with a time-based automation enabled, read
// its `vw_automation_due` view (rows that are due right now) and send the
// email / SMS, deduped via automation_time_log and metered per plan.
export async function GET(req: NextRequest) {
  if ((req.headers.get("authorization") ?? "") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = createServiceClient();
  const period = currentAutomationPeriod();

  const { data: apps } = await service
    .from("apps")
    .select("id, user_id, name, category, secondary_categories")
    .eq("status", "deployed")
    .not("user_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(MAX_APPS_PER_RUN);

  // usage cache: userId -> { email, sms }
  const usage = new Map<string, { email: number; sms: number; limitEmail: number; limitSms: number }>();
  async function loadUsage(userId: string) {
    if (usage.has(userId)) return usage.get(userId)!;
    const [{ data: prof }, { data: row }] = await Promise.all([
      service.from("profiles").select("plan").eq("id", userId).single(),
      service
        .from("automation_usage")
        .select("sent_count, sms_sent_count")
        .eq("user_id", userId)
        .eq("period", period)
        .maybeSingle(),
    ]);
    const plan = (prof?.plan ?? "free") as Plan;
    const entry = {
      email: row?.sent_count ?? 0,
      sms: row?.sms_sent_count ?? 0,
      limitEmail: AUTOMATION_SEND_LIMITS[plan],
      limitSms: AUTOMATION_SMS_LIMITS[plan],
    };
    usage.set(userId, entry);
    return entry;
  }
  async function bumpUsage(userId: string, channel: "email" | "sms") {
    const e = usage.get(userId)!;
    if (channel === "email") e.email += 1;
    else e.sms += 1;
    await service.from("automation_usage").upsert(
      {
        user_id: userId,
        period,
        sent_count: e.email,
        sms_sent_count: e.sms,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,period" },
    );
  }

  let sent = 0;
  let apps_scanned = 0;

  for (const app of apps ?? []) {
    const defs = timeBasedAutomations([
      app.category,
      ...(app.secondary_categories ?? []),
    ] as AppCategory[]);
    if (defs.length === 0) continue;

    const { data: workflows } = await service
      .from("automation_workflows")
      .select("trigger_type, enabled, channel")
      .eq("app_id", app.id)
      .eq("enabled", true);
    const enabled = new Map(
      (workflows ?? [])
        .filter((w) => defs.some((d) => d.trigger_type === w.trigger_type))
        .map((w) => [w.trigger_type, w.channel]),
    );
    if (enabled.size === 0) continue;

    apps_scanned++;
    const tc = createTenantServiceClient(`app_${app.id.slice(0, 8)}`);
    const { data: due, error } = await tc
      .from("vw_automation_due")
      .select("trigger_type, ref_id, recipient_email, recipient_phone, context");
    if (error || !due?.length) continue;

    let perApp = 0;
    for (const raw of due as DueRow[]) {
      if (perApp >= MAX_SENDS_PER_APP) break;
      const channel = enabled.get(raw.trigger_type);
      if (!channel) continue;

      const refId = String(raw.ref_id ?? "");
      if (!refId) continue;

      // Dedupe: already actioned this row for this trigger?
      const { data: seen } = await service
        .from("automation_time_log")
        .select("id")
        .eq("app_id", app.id)
        .eq("trigger_type", raw.trigger_type)
        .eq("ref_id", refId)
        .maybeSingle();
      if (seen) continue;

      const u = await loadUsage(app.user_id!);
      const msg = renderAutomationMessage(raw.trigger_type, app.name, raw.context ?? {});

      // SMS channel with no phone on file falls back to email.
      const useSms = channel === "sms" && !!raw.recipient_phone;
      let ok = false;
      if (useSms) {
        if (u.sms >= u.limitSms) continue;
        ok = (await sendAutomationSms(raw.recipient_phone!, msg.sms)).ok;
      } else if (raw.recipient_email) {
        if (u.email >= u.limitEmail) continue;
        ok = (
          await sendAutomationEmail({
            to: raw.recipient_email,
            subject: msg.subject,
            html: msg.html,
            fromName: app.name,
          })
        ).ok;
      } else {
        continue; // no usable recipient
      }
      if (!ok) continue;

      await service.from("automation_time_log").insert({
        app_id: app.id,
        trigger_type: raw.trigger_type,
        ref_id: refId,
      });
      await bumpUsage(app.user_id!, useSms ? "sms" : "email");
      sent++;
      perApp++;
    }
  }

  return NextResponse.json({ apps_scanned, sent });
}
