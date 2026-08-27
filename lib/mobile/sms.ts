// Provider: Twilio, per spec. Keys in Vercel env vars only
// (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER).
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_FROM_NUMBER = process.env.TWILIO_FROM_NUMBER;

// Mirrors lib/marketing/sendCampaign.ts's IS_PRODUCTION gate.
const IS_PRODUCTION = process.env.VERCEL_ENV === "production";

const BATCH_SIZE = 5; // Twilio has no bulk-send endpoint — one request per recipient

export interface SendSmsResult {
  ok: boolean;
  error?: string;
}

export async function sendSms(params: { to: string; body: string }): Promise<SendSmsResult> {
  if (!IS_PRODUCTION) {
    console.log(`[mobile/sms] non-production (VERCEL_ENV=${process.env.VERCEL_ENV ?? "unset"}), not sending to ${params.to}: "${params.body}"`);
    return { ok: true };
  }

  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM_NUMBER) {
    return { ok: false, error: "Twilio is not configured (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER missing)" };
  }

  const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString("base64");
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      To: params.to,
      From: TWILIO_FROM_NUMBER,
      Body: params.body,
      // Twilio delivery status callback — see app/api/mobile/sms/status.
      StatusCallback: `${process.env.NEXT_PUBLIC_APP_URL ?? "https://vision-workx.vercel.app"}/api/mobile/sms/status`,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, error: `Twilio ${res.status}: ${text}` };
  }
  return { ok: true };
}

export interface SendSmsBatchResult {
  sent: number;
  failed: number;
  errors: string[];
}

export async function sendSmsToRecipients(params: { recipients: string[]; body: string }): Promise<SendSmsBatchResult> {
  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  for (let i = 0; i < params.recipients.length; i += BATCH_SIZE) {
    const batch = params.recipients.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(batch.map((to) => sendSms({ to, body: params.body })));
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
