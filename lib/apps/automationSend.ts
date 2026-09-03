// Delivery for generated-app automations. These messages go to the
// business's OWN customers (a booking reminder, a payment nudge) — they are
// transactional and "from" the business, so they do NOT use the VisionWorkx
// marketing sender / unsubscribe footer in lib/marketing/sendCampaign.ts.

import { sendSms } from "@/lib/mobile/sms";

const RESEND_KEY = process.env.RESEND_API_KEY;
const IS_PRODUCTION = process.env.VERCEL_ENV === "production";

export interface SendResult {
  ok: boolean;
  error?: string;
}

export async function sendAutomationEmail(params: {
  to: string;
  subject: string;
  html: string;
  fromName: string;
}): Promise<SendResult> {
  if (!IS_PRODUCTION) {
    console.log(
      `[apps/automationSend] non-production, not emailing ${params.to}: "${params.subject}"`,
    );
    return { ok: true };
  }
  if (!RESEND_KEY) return { ok: false, error: "RESEND_API_KEY not configured" };

  const from = `${params.fromName.replace(/[<>"\r\n]/g, "").slice(0, 60)} <notifications@notify.revalorllc.com>`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [params.to], subject: params.subject, html: params.html }),
  });
  if (!res.ok) {
    return { ok: false, error: `Resend ${res.status}: ${(await res.text()).slice(0, 200)}` };
  }
  return { ok: true };
}

export async function sendAutomationSms(to: string, body: string): Promise<SendResult> {
  return sendSms({ to, body });
}
