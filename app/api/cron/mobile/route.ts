import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { generatePushCampaign, generateSmsCampaign } from "@/lib/mobile/generator";
import { getPushAudience, getSmsAudience, filterSmsOptOuts } from "@/lib/mobile/audience";
import { sendMobileCampaign } from "@/lib/mobile/sendCampaign";
import { PRODUCT_LABEL } from "@/lib/marketing/products";
import { buildDigestContext } from "@/lib/marketing/digestContext";
import { computeNextRun } from "@/lib/marketing/recurrence";
import { sendReviewAlert } from "@/lib/marketing/alerts";
import type { MarketingAutonomy, MarketingChannel, MarketingProduct } from "@/lib/database.types";

export const runtime = "nodejs";
export const maxDuration = 300;

type Service = ReturnType<typeof createServiceClient>;

interface DueCampaign {
  id: string;
  product: MarketingProduct;
  channel: MarketingChannel;
  goal: string | null;
  voice_notes: string | null;
  autonomy: MarketingAutonomy;
}

// Mirrors app/api/cron/email's processDueCampaign — same digest-context
// fallback, same autonomy/review split — dispatching generation and
// audience resolution by channel (push vs sms) instead of always email.
async function processDueCampaign(service: Service, campaign: DueCampaign): Promise<"sent" | "pending_review" | "failed" | "skipped"> {
  if (campaign.channel === "email") throw new Error("cron/mobile received an email campaign");
  const now = new Date().toISOString();

  try {
    const digestContext = await buildDigestContext(campaign.product);
    const goal = campaign.goal?.trim()
      ? digestContext
        ? `${campaign.goal.trim()}\n\n${digestContext}`
        : campaign.goal.trim()
      : digestContext || "Write a product update.";

    const productLabel = PRODUCT_LABEL[campaign.product];
    let subject = "";
    let bodyText = "";
    if (campaign.channel === "push") {
      const generated = await generatePushCampaign({ productLabel, voiceNotes: campaign.voice_notes, goal });
      subject = generated.title;
      bodyText = generated.body;
    } else {
      const generated = await generateSmsCampaign({ productLabel, voiceNotes: campaign.voice_notes, goal });
      bodyText = generated.body;
    }

    // No opted-in audience exists for any product yet (Project 04
    // orientation) — recipients is always [] today, so this always ends
    // in "skipped" in practice. Kept as a real resolution step (not a
    // hardcoded skip) so it starts working the moment a product captures
    // push tokens/SMS consent, with no code change needed here.
    const recipients =
      campaign.channel === "push"
        ? (await getPushAudience(campaign.product)).map((r) => r.token)
        : await filterSmsOptOuts((await getSmsAudience(campaign.product)).map((r) => r.phone));

    await service
      .from("marketing_campaigns")
      .update({ subject, body_html: bodyText, status: "generated", recipient_count: recipients.length, updated_at: now })
      .eq("id", campaign.id);

    if (recipients.length === 0) {
      await service.from("marketing_campaigns").update({ status: "canceled", canceled_at: now, updated_at: now }).eq("id", campaign.id);
      return "skipped";
    }

    if (campaign.autonomy === "auto") {
      await sendMobileCampaign(campaign.id, recipients);
      return "sent";
    }

    await service.from("marketing_campaigns").update({ status: "pending_review", updated_at: now }).eq("id", campaign.id);
    await sendReviewAlert({ productName: productLabel, subject: subject || bodyText, campaignId: campaign.id });
    return "pending_review";
  } catch (err) {
    console.error(`[cron/mobile] failed for campaign ${campaign.id}:`, err);
    await service.from("marketing_campaigns").update({ status: "failed", updated_at: now }).eq("id", campaign.id);
    return "failed";
  }
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = createServiceClient();
  const now = new Date();

  const outcomes = { sent: 0, pending_review: 0, failed: 0, skipped: 0 };
  let oneOffProcessed = 0;
  let recurringFired = 0;

  const { data: dueCampaigns, error: dueCampaignsError } = await service
    .from("marketing_campaigns")
    .select("id, product, channel, goal, voice_notes, autonomy")
    .eq("status", "scheduled")
    .in("channel", ["push", "sms"])
    .lte("run_at", now.toISOString());
  if (dueCampaignsError) {
    return NextResponse.json({ error: dueCampaignsError.message }, { status: 500 });
  }

  for (const campaign of dueCampaigns ?? []) {
    const outcome = await processDueCampaign(service, campaign);
    outcomes[outcome]++;
    oneOffProcessed++;
  }

  const { data: dueSchedules, error: dueSchedulesError } = await service
    .from("marketing_recurring_schedules")
    .select("*")
    .eq("active", true)
    .in("channel", ["push", "sms"])
    .lte("next_run_at", now.toISOString());
  if (dueSchedulesError) {
    return NextResponse.json({ error: dueSchedulesError.message }, { status: 500 });
  }

  for (const schedule of dueSchedules ?? []) {
    const { data: inserted, error: insertError } = await service
      .from("marketing_campaigns")
      .insert({
        product: schedule.product,
        channel: schedule.channel,
        subject: "",
        body_html: "",
        status: "scheduled",
        goal: schedule.goal,
        voice_notes: schedule.voice_notes,
        autonomy: schedule.autonomy,
        run_at: now.toISOString(),
        recurring_schedule_id: schedule.id,
      })
      .select("id, product, channel, goal, voice_notes, autonomy")
      .single();

    if (!insertError && inserted) {
      const outcome = await processDueCampaign(service, inserted);
      outcomes[outcome]++;
      recurringFired++;
    } else if (insertError) {
      console.error(`[cron/mobile] failed to create occurrence for recurring schedule ${schedule.id}:`, insertError.message);
    }

    const nextRunAt = computeNextRun(
      {
        recurrence: schedule.recurrence,
        dayOfWeek: schedule.day_of_week,
        dayOfMonth: schedule.day_of_month,
        hourUtc: schedule.hour_utc,
      },
      now
    );
    await service
      .from("marketing_recurring_schedules")
      .update({ next_run_at: nextRunAt.toISOString(), updated_at: now.toISOString() })
      .eq("id", schedule.id);
  }

  return NextResponse.json({ oneOffProcessed, recurringFired, outcomes });
}
