import { createServiceClient } from "@/lib/supabase";
import type { MarketingProduct } from "@/lib/database.types";
import { signUnsubscribeToken } from "./unsubscribeToken";

const RESEND_KEY = process.env.RESEND_API_KEY;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://vision-workx.vercel.app";

const BATCH_SIZE = 5;

function unsubscribeFooter(product: MarketingProduct, email: string): string {
  const token = signUnsubscribeToken({ product, email });
  const url = `${APP_URL}/api/marketing/unsubscribe?token=${encodeURIComponent(token)}`;
  return `<p style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8">
    You're receiving this because you have a Revalor account. <a href="${url}" style="color:#94a3b8">Unsubscribe</a>
  </p>`;
}

async function sendOne(params: {
  to: string;
  subject: string;
  bodyHtml: string;
  product: MarketingProduct;
}): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "Revalor LLC <outreach@notify.revalorllc.com>",
      to: [params.to],
      reply_to: "admin@revalorllc.com",
      subject: params.subject,
      html: `<div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:600px;margin:0 auto">${params.bodyHtml}${unsubscribeFooter(params.product, params.to)}</div>`,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, error: `Resend ${res.status}: ${text}` };
  }
  return { ok: true };
}

export interface SendResult {
  sent: number;
  failed: number;
  errors: string[];
}

export async function sendToRecipients(params: {
  product: MarketingProduct;
  subject: string;
  bodyHtml: string;
  recipients: string[];
}): Promise<SendResult> {
  if (!RESEND_KEY) throw new Error("Email sending is not configured (RESEND_API_KEY missing)");

  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  for (let i = 0; i < params.recipients.length; i += BATCH_SIZE) {
    const batch = params.recipients.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map((to) => sendOne({ to, subject: params.subject, bodyHtml: params.bodyHtml, product: params.product }))
    );
    for (const result of results) {
      if (result.ok) sent++;
      else {
        failed++;
        if (result.error) errors.push(result.error);
      }
    }
  }

  return { sent, failed, errors };
}

// Sends a campaign (fetching the live audience and updating its row's
// counters/status), used by the real "send to N recipients" action.
export async function sendCampaign(campaignId: string, recipients: string[]): Promise<SendResult> {
  const service = createServiceClient();
  const { data: campaign, error } = await service
    .from("marketing_campaigns")
    .select("product, subject, body_html")
    .eq("id", campaignId)
    .maybeSingle();
  if (error) throw error;
  if (!campaign) throw new Error("Campaign not found");

  await service
    .from("marketing_campaigns")
    .update({ status: "sending", recipient_count: recipients.length, updated_at: new Date().toISOString() })
    .eq("id", campaignId);

  const result = await sendToRecipients({
    product: campaign.product,
    subject: campaign.subject,
    bodyHtml: campaign.body_html,
    recipients,
  });

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
