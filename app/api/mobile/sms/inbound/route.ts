import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { verifyTwilioSignature } from "@/lib/mobile/twilioSignature";

export const runtime = "nodejs";
export const maxDuration = 15;

// Twilio's own standard opt-out keyword set.
const STOP_KEYWORDS = new Set(["stop", "stopall", "unsubscribe", "cancel", "end", "quit"]);

export async function POST(req: NextRequest) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const signature = req.headers.get("x-twilio-signature");
  const raw = await req.text();
  const params = Object.fromEntries(new URLSearchParams(raw));

  if (!authToken || !verifyTwilioSignature({ url: req.url, body: params, signature, authToken })) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  }

  const from = params.From;
  const body = (params.Body ?? "").trim().toLowerCase();

  if (from && STOP_KEYWORDS.has(body)) {
    const service = createServiceClient();
    await service.from("mobile_sms_opt_outs").upsert({ phone: from, source: "reply_stop" }, { onConflict: "phone", ignoreDuplicates: true });
  }

  // Empty TwiML — Twilio's own Advanced Opt-Out (enabled per-number in the
  // console) already sends the carrier-required STOP confirmation, so this
  // app doesn't need to auto-reply on top of it.
  return new NextResponse("<Response></Response>", { headers: { "Content-Type": "text/xml" } });
}
