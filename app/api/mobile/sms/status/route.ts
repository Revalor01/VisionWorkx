import { NextRequest, NextResponse } from "next/server";
import { verifyTwilioSignature } from "@/lib/mobile/twilioSignature";

export const runtime = "nodejs";
export const maxDuration = 15;

// Delivery status callback (queued/sent/delivered/failed/undelivered).
// No per-recipient tracking exists on marketing_campaigns yet (it logs
// aggregate sent/failed counts, same as email) — this just makes
// delivery failures visible in logs rather than silently vanishing.
export async function POST(req: NextRequest) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const signature = req.headers.get("x-twilio-signature");
  const raw = await req.text();
  const params = Object.fromEntries(new URLSearchParams(raw));

  if (!authToken || !verifyTwilioSignature({ url: req.url, body: params, signature, authToken })) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  }

  if (params.MessageStatus === "failed" || params.MessageStatus === "undelivered") {
    console.error(`[mobile/sms/status] ${params.MessageSid} to ${params.To}: ${params.MessageStatus} (error ${params.ErrorCode ?? "unknown"})`);
  }

  return new NextResponse(null, { status: 204 });
}
