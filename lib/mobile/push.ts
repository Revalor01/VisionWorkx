// Provider: Expo Push. Chosen over Firebase Cloud Messaging or OneSignal
// because nothing in this codebase talks to FCM or holds a OneSignal
// account today, while Expo Push needs no account/credential to send at
// all (EXPO_ACCESS_TOKEN below is optional, for higher rate limits and
// once EAS push security is enabled) — and it's the same ecosystem the
// legacy sanctum-app (Expo/React Native) already used, so any future
// Expo-based client in this product family plugs straight in.
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_ACCESS_TOKEN = process.env.EXPO_ACCESS_TOKEN;
const BATCH_SIZE = 100; // Expo's own per-request limit

// Mirrors lib/marketing/sendCampaign.ts's IS_PRODUCTION gate — every
// mobile send (push and SMS) must be inert outside a production deploy,
// same reasoning as email: a bug in preview/dev must never reach a real
// user's device.
const IS_PRODUCTION = process.env.VERCEL_ENV === "production";

export interface PushRecipient {
  token: string;
}

export interface SendPushResult {
  sent: number;
  failed: number;
  errors: string[];
  // Tokens Expo reported as permanently dead (DeviceNotRegistered) — the
  // caller should stop using these. No token store exists yet (Project 04
  // orientation: no product persists push tokens anywhere reachable), so
  // there's nothing to delete them from today; surfaced for when there is.
  invalidTokens: string[];
}

interface ExpoTicket {
  status: "ok" | "error";
  message?: string;
  details?: { error?: string };
}

async function sendBatch(tokens: string[], title: string, body: string): Promise<SendPushResult> {
  if (!IS_PRODUCTION) {
    console.log(`[mobile/push] non-production (VERCEL_ENV=${process.env.VERCEL_ENV ?? "unset"}), not sending "${title}" to ${tokens.length} device(s)`);
    return { sent: tokens.length, failed: 0, errors: [], invalidTokens: [] };
  }

  const res = await fetch(EXPO_PUSH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${EXPO_ACCESS_TOKEN}` } : {}),
    },
    body: JSON.stringify(tokens.map((to) => ({ to, title, body, sound: "default" }))),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { sent: 0, failed: tokens.length, errors: [`Expo push ${res.status}: ${text}`], invalidTokens: [] };
  }

  const json = (await res.json()) as { data?: ExpoTicket[] };
  const tickets = json.data ?? [];

  let sent = 0;
  let failed = 0;
  const errors: string[] = [];
  const invalidTokens: string[] = [];

  tickets.forEach((ticket, i) => {
    if (ticket.status === "ok") {
      sent++;
      return;
    }
    failed++;
    if (ticket.details?.error === "DeviceNotRegistered") invalidTokens.push(tokens[i]);
    if (ticket.message) errors.push(ticket.message);
  });

  return { sent, failed, errors, invalidTokens };
}

export async function sendPushToRecipients(params: { recipients: PushRecipient[]; title: string; body: string }): Promise<SendPushResult> {
  const { recipients, title, body } = params;
  let sent = 0;
  let failed = 0;
  const errors: string[] = [];
  const invalidTokens: string[] = [];

  for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
    const batch = recipients.slice(i, i + BATCH_SIZE).map((r) => r.token);
    const result = await sendBatch(batch, title, body);
    sent += result.sent;
    failed += result.failed;
    errors.push(...result.errors);
    invalidTokens.push(...result.invalidTokens);
  }

  return { sent, failed, errors, invalidTokens };
}
