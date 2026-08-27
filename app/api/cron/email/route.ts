import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { generateEmailCampaign } from "@/lib/marketing/emailGenerator";
import { getSendableAudience } from "@/lib/marketing/audience";
import { sendCampaign } from "@/lib/marketing/sendCampaign";
import { PRODUCT_LABEL } from "@/lib/marketing/products";
import { buildDigestContext } from "@/lib/marketing/digestContext";
import { computeNextRun } from "@/lib/marketing/recurrence";
import { sendReviewAlert } from "@/lib/marketing/alerts";
import type { MarketingProduct, MarketingAutonomy } from "@/lib/database.types";

export const runtime = "nodejs";
export const maxDuration = 300;

type Service = ReturnType<typeof createServiceClient>;

interface DueCampaign {
  id: string;
  product: MarketingProduct;
  goal: string | null;
  voice_notes: string | null;
  autonomy: MarketingAutonomy;
}

// Generates the due campaign's draft (folding in a recurring digest's
// recent-activity context when there's no operator-written goal) and
// either sends it (autonomy: "auto") or parks it in pending_review and
// alerts the admin (autonomy: "manual", the default for anything net-new).
async function processDueCampaign(service: Service, campaign: DueCampaign): Promise<"sent" | "pending_review" | "failed"> {
  const now = new Date().toISOString();
  try {
    const digestContext = await buildDigestContext(campaign.product);
    const goal = campaign.goal?.trim()
      ? digestContext
        ? `${campaign.goal.trim()}\n\n${digestContext}`
        : campaign.goal.trim()
      : digestContext || "Write a product update digest for our existing users.";

    const email = await generateEmailCampaign({
      productLabel: PRODUCT_LABEL[campaign.product],
      voiceNotes: campaign.voice_notes,
      goal,
    });

    await service
      .from("marketing_campaigns")
      .update({ subject: email.subject, body_html: email.bodyHtml, status: "generated", updated_at: now })
      .eq("id", campaign.id);

    if (campaign.autonomy === "auto") {
      const recipients = await getSendableAudience(campaign.product);
      await sendCampaign(campaign.id, recipients.map((r) => r.email));
      return "sent";
    }

    await service.from("marketing_campaigns").update({ status: "pending_review", updated_at: now }).eq("id", campaign.id);
    await sendReviewAlert({ productName: PRODUCT_LABEL[campaign.product], subject: email.subject, campaignId: campaign.id });
    return "pending_review";
  } catch (err) {
    console.error(`[cron/email] failed for campaign ${campaign.id}:`, err);
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

  const outcomes = { sent: 0, pending_review: 0, failed: 0 };
  let oneOffProcessed = 0;
  let recurringFired = 0;

  const { data: dueCampaigns, error: dueCampaignsError } = await service
    .from("marketing_campaigns")
    .select("id, product, goal, voice_notes, autonomy")
    .eq("status", "scheduled")
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
    .lte("next_run_at", now.toISOString());
  if (dueSchedulesError) {
    return NextResponse.json({ error: dueSchedulesError.message }, { status: 500 });
  }

  for (const schedule of dueSchedules ?? []) {
    const { data: inserted, error: insertError } = await service
      .from("marketing_campaigns")
      .insert({
        product: schedule.product,
        subject: "",
        body_html: "",
        status: "scheduled",
        goal: schedule.goal,
        voice_notes: schedule.voice_notes,
        autonomy: schedule.autonomy,
        run_at: now.toISOString(),
        recurring_schedule_id: schedule.id,
      })
      .select("id, product, goal, voice_notes, autonomy")
      .single();

    if (!insertError && inserted) {
      const outcome = await processDueCampaign(service, inserted);
      outcomes[outcome]++;
      recurringFired++;
    } else if (insertError) {
      console.error(`[cron/email] failed to create occurrence for recurring schedule ${schedule.id}:`, insertError.message);
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
