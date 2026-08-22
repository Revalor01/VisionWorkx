import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { verifySocialApiWebhookSignature, findConversationId, sendInboxReply } from "@/lib/social/socialApi";
import { classifyInboundMessage } from "@/lib/social/classifyInbound";
import type { SocialPlatform } from "@/lib/database.types";

export const runtime = "nodejs";
export const maxDuration = 60;

const WEBHOOK_SECRET = process.env.SOCIALAPI_WEBHOOK_SECRET;

interface DmReceivedPayload {
  event: "dm.received";
  data: {
    id: string;
    platform: string;
    account_id: string;
    author: { id: string };
    content: { text?: string };
  };
}

interface CommentReceivedPayload {
  event: "comment.received";
  data: {
    platform: string;
    account_id: string;
    author: { id: string; username?: string };
    content: { text?: string };
  };
}

type WebhookPayload = DmReceivedPayload | CommentReceivedPayload | { event: string; data: unknown };

function toSocialPlatform(platform: string): SocialPlatform | null {
  if (platform === "facebook" || platform === "instagram" || platform === "tiktok" || platform === "youtube") {
    return platform;
  }
  return null;
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-socialapi-signature");

  // SocialAPI pings this endpoint (unsigned) to verify reachability before
  // handing out the signing secret during POST /v1/webhooks registration —
  // nothing to process yet, so just confirm we're alive. Once a secret
  // exists, every real event arrives signed, so a present-but-wrong
  // signature is genuinely rejected below rather than let through.
  if (!signature) return NextResponse.json({ received: true });

  if (!WEBHOOK_SECRET || !verifySocialApiWebhookSignature(rawBody, signature, WEBHOOK_SECRET)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const payload = JSON.parse(rawBody) as WebhookPayload;
  const service = createServiceClient();

  if (payload.event === "dm.received") {
    const { data } = payload as DmReceivedPayload;
    const text = data.content?.text;
    const platform = toSocialPlatform(data.platform);
    if (!text || !platform) return NextResponse.json({ received: true });

    // account_id could be from any of the four SocialAPI connections a
    // brand can have — one brand, one match, regardless of which column.
    const { data: brand } = await service
      .from("social_brands")
      .select("*")
      .or(
        `socialapi_account_id.eq.${data.account_id},socialapi_tiktok_account_id.eq.${data.account_id},socialapi_youtube_account_id.eq.${data.account_id},socialapi_facebook_account_id.eq.${data.account_id}`
      )
      .maybeSingle();
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

    await service.from("social_inbox_items").insert({
      brand_id: brand.id,
      platform,
      source_type: "dm",
      sender_id: data.author.id,
      message_text: text,
      classification: result.classification,
      auto_reply_text: result.replyText,
    });
  } else if (payload.event === "comment.received") {
    const { data } = payload as CommentReceivedPayload;
    const text = data.content?.text;
    const platform = toSocialPlatform(data.platform);
    if (!text || !platform) return NextResponse.json({ received: true });

    const { data: brand } = await service
      .from("social_brands")
      .select("id")
      .or(
        `socialapi_account_id.eq.${data.account_id},socialapi_tiktok_account_id.eq.${data.account_id},socialapi_youtube_account_id.eq.${data.account_id},socialapi_facebook_account_id.eq.${data.account_id}`
      )
      .maybeSingle();
    if (!brand) return NextResponse.json({ received: true });

    // Comments — logged for manual review only, same as the old direct
    // webhook: public comment replies use a different risk profile than
    // DMs, deliberately not auto-answered.
    await service.from("social_inbox_items").insert({
      brand_id: brand.id,
      platform,
      source_type: "comment",
      sender_id: data.author.id,
      sender_name: data.author.username ?? null,
      message_text: text,
      classification: "requires_human",
    });
  }

  return NextResponse.json({ received: true });
}
