import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { verifyWebhookSignature, verifyWebhookChallenge, sendMessage } from "@/lib/social/meta";
import { classifyInboundMessage } from "@/lib/social/classifyInbound";
import type { SocialPlatform } from "@/lib/database.types";

export const runtime = "nodejs";
export const maxDuration = 60;

// Meta's one-time webhook verification handshake when the endpoint is
// first configured in the App Dashboard.
export async function GET(req: NextRequest) {
  const challenge = verifyWebhookChallenge(req.nextUrl.searchParams);
  if (challenge === null) return NextResponse.json({ error: "Verification failed" }, { status: 403 });
  return new NextResponse(challenge, { status: 200 });
}

interface MessagingEntry {
  id: string; // Page ID or IG business ID
  messaging?: { sender: { id: string }; message?: { text?: string } }[];
  changes?: { field: string; value: { text?: string; from?: { id: string; username?: string } } }[];
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-hub-signature-256");

  if (!verifyWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const payload = JSON.parse(rawBody) as { object: string; entry: MessagingEntry[] };
  const platform: SocialPlatform = payload.object === "instagram" ? "instagram" : "facebook";
  const service = createServiceClient();

  for (const entry of payload.entry ?? []) {
    const { data: brand } = await service
      .from("social_brands")
      .select("*")
      .or(`fb_page_id.eq.${entry.id},ig_business_id.eq.${entry.id}`)
      .maybeSingle();
    if (!brand) continue; // event for a page we don't manage in this tool

    const { data: connection } = await service
      .from("social_connections")
      .select("fb_page_access_token")
      .eq("brand_id", brand.id)
      .maybeSingle();

    // Direct messages
    for (const m of entry.messaging ?? []) {
      const text = m.message?.text;
      if (!text) continue;

      const result = await classifyInboundMessage({ faqDocument: brand.faq_document, messageText: text });

      if (result.classification === "auto_answered" && result.replyText && connection && brand.fb_page_id) {
        try {
          await sendMessage({
            pageId: brand.fb_page_id,
            pageAccessToken: connection.fb_page_access_token,
            recipientId: m.sender.id,
            text: result.replyText,
          });
        } catch (err) {
          console.error("[social-meta webhook] auto-reply send failed:", err);
        }
      }

      await service.from("social_inbox_items").insert({
        brand_id: brand.id,
        platform,
        source_type: "dm",
        sender_id: m.sender.id,
        message_text: text,
        classification: result.classification,
        auto_reply_text: result.replyText,
      });
    }

    // Comments — logged for manual review only in this phase; public
    // comment replies use a different Graph endpoint/risk profile than
    // DMs, deliberately not auto-answered yet.
    for (const c of entry.changes ?? []) {
      const text = c.value?.text;
      if (!text) continue;

      await service.from("social_inbox_items").insert({
        brand_id: brand.id,
        platform,
        source_type: "comment",
        sender_id: c.value?.from?.id ?? "unknown",
        sender_name: c.value?.from?.username ?? null,
        message_text: text,
        classification: "requires_human",
      });
    }
  }

  return NextResponse.json({ received: true });
}
