import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { verifySocialApiWebhookSignature, findConversationId, sendInboxReply } from "@/lib/social/socialApi";
import { classifyInboundMessage } from "@/lib/social/classifyInbound";
import type { SocialPlatform } from "@/lib/database.types";

export const runtime = "nodejs";
export const maxDuration = 60;

const WEBHOOK_SECRET = process.env.SOCIALAPI_WEBHOOK_SECRET;

interface DmReceivedPayload {
  event_type: "dm.received";
  payload: {
    id: string;
    platform: string;
    account_id: string;
    author: { id: string };
    content: { text?: string };
  };
}

interface CommentReceivedPayload {
  event_type: "comment.received";
  payload: {
    platform: string;
    account_id: string;
    author: { id: string; username?: string };
    content: { text?: string };
  };
}

// Actual delivered shape is { event_type, payload } — the "Webhooks" guide
// doc describes it as { event, data }, which does NOT match what's really
// sent (confirmed via a live test delivery + GET .../deliveries/{id}).
type WebhookPayload = DmReceivedPayload | CommentReceivedPayload | { event_type: string; payload: unknown };

function toSocialPlatform(platform: string): SocialPlatform | null {
  if (platform === "facebook" || platform === "instagram" || platform === "tiktok" || platform === "youtube") {
    return platform;
  }
  return null;
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-socialapi-signature");

  // SocialAPI pings this endpoint (already signed, with a secret it hasn't
  // handed us yet) to verify reachability during POST /v1/webhooks
  // registration — there's nothing to check that signature against until
  // SOCIALAPI_WEBHOOK_SECRET is actually configured, so just ack. Once the
  // secret exists (set right after registration succeeds), every request
  // is verified for real and anything that doesn't match is rejected.
  if (!WEBHOOK_SECRET) return NextResponse.json({ received: true });

  if (!verifySocialApiWebhookSignature(rawBody, signature, WEBHOOK_SECRET)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const payload = JSON.parse(rawBody) as WebhookPayload;
  const service = createServiceClient();

  if (payload.event_type === "dm.received") {
    const { payload: data } = payload as DmReceivedPayload;
    const text = data.content?.text;
    const platform = toSocialPlatform(data.platform);
    if (!text || !platform) return NextResponse.json({ received: true });

    // account_id could be from any of the four SocialAPI connections a
    // brand can have — one brand, one match, regardless of which column.
    const { data: brand, error: brandError } = await service
      .from("social_brands")
      .select("*")
      .or(
        `socialapi_account_id.eq.${data.account_id},socialapi_tiktok_account_id.eq.${data.account_id},socialapi_youtube_account_id.eq.${data.account_id},socialapi_facebook_account_id.eq.${data.account_id}`
      )
      .maybeSingle();
    if (brandError) console.error("[webhooks/socialapi] dm.received: brand lookup failed:", brandError.message);
    if (!brand) return NextResponse.json({ received: true }); // account we don't manage in this tool

    const result = await classifyInboundMessage({ faqDocument: brand.faq_document, messageText: text });

    if (result.classification === "auto_answered" && result.replyText) {
      try {
        const conversationId = await findConversationId(data.account_id, data.author.id);
        if (conversationId) {
          await sendInboxReply(conversationId, data.account_id, result.replyText);
        } else {
          console.error("[webhooks/socialapi] dm.received: no conversation found for auto-reply", data.id);
        }
      } catch (err) {
        console.error("[webhooks/socialapi] auto-reply send failed:", err);
      }
    }

    const { error: insertError } = await service.from("social_inbox_items").insert({
      brand_id: brand.id,
      platform,
      source_type: "dm",
      sender_id: data.author.id,
      message_text: text,
      classification: result.classification,
      auto_reply_text: result.replyText,
    });
    if (insertError) console.error("[webhooks/socialapi] dm.received: inbox insert failed:", insertError.message);
  } else if (payload.event_type === "comment.received") {
    const { payload: data } = payload as CommentReceivedPayload;
    const text = data.content?.text;
    const platform = toSocialPlatform(data.platform);
    if (!text || !platform) return NextResponse.json({ received: true });

    const { data: brand, error: brandError } = await service
      .from("social_brands")
      .select("id")
      .or(
        `socialapi_account_id.eq.${data.account_id},socialapi_tiktok_account_id.eq.${data.account_id},socialapi_youtube_account_id.eq.${data.account_id},socialapi_facebook_account_id.eq.${data.account_id}`
      )
      .maybeSingle();
    if (brandError) console.error("[webhooks/socialapi] comment.received: brand lookup failed:", brandError.message);
    if (!brand) return NextResponse.json({ received: true });

    // Comments — logged for manual review only, same as the old direct
    // webhook: public comment replies use a different risk profile than
    // DMs, deliberately not auto-answered.
    const { error: insertError } = await service.from("social_inbox_items").insert({
      brand_id: brand.id,
      platform,
      source_type: "comment",
      sender_id: data.author.id,
      sender_name: data.author.username ?? null,
      message_text: text,
      classification: "requires_human",
    });
    if (insertError) console.error("[webhooks/socialapi] comment.received: inbox insert failed:", insertError.message);
  }

  return NextResponse.json({ received: true });
}
