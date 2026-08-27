import { createServiceClient } from "@/lib/supabase";
import { sendPushToRecipients } from "@/lib/mobile/push";
import { sendSmsToRecipients } from "@/lib/mobile/sms";
import type { MarketingChannel } from "@/lib/database.types";

export interface SendMobileResult {
  sent: number;
  failed: number;
  errors: string[];
}

// Mirrors lib/marketing/sendCampaign.ts's sendCampaign() shape — fetches
// the campaign row and sends to an explicit recipients list (not "the
// whole audience," same reasoning as email: callers decide who, this just
// dispatches and logs). `recipients` are push tokens for channel="push",
// phone numbers for channel="sms" — the campaign row already carries which.
export async function sendMobileCampaign(campaignId: string, recipients: string[]): Promise<SendMobileResult> {
  const service = createServiceClient();
  const { data: campaign, error } = await service
    .from("marketing_campaigns")
    .select("channel, subject, body_html")
    .eq("id", campaignId)
    .maybeSingle();
  if (error) throw error;
  if (!campaign) throw new Error("Campaign not found");
  if (campaign.channel === "email") throw new Error("sendMobileCampaign called on an email campaign");

  await service
    .from("marketing_campaigns")
    .update({ status: "sending", recipient_count: recipients.length, updated_at: new Date().toISOString() })
    .eq("id", campaignId);

  const result = await dispatch(campaign.channel, campaign.subject, campaign.body_html, recipients);

  await service
    .from("marketing_campaigns")
    .update({
      status: result.failed > 0 && result.sent === 0 ? "failed" : "sent",
      sent_count: result.sent,
      failed_count: result.failed,
      sent_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", campaignId);

  return result;
}

async function dispatch(channel: MarketingChannel, title: string, body: string, recipients: string[]): Promise<SendMobileResult> {
  if (channel === "push") {
    const result = await sendPushToRecipients({ recipients: recipients.map((token) => ({ token })), title, body });
    return { sent: result.sent, failed: result.failed, errors: result.errors };
  }
  if (channel === "sms") {
    return sendSmsToRecipients({ recipients, body });
  }
  throw new Error(`Unsupported mobile channel: ${channel}`);
}
