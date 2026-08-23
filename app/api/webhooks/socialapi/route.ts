import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { verifySocialApiWebhookSignature, findConversationId, sendInboxReply } from "@/lib/social/socialApi";
import { classifyInboundMessage } from "@/lib/social/classifyInbound";
import { raiseAutonomyFlag } from "@/lib/social/autonomyFlags";
import type { SocialPlatform } from "@/lib/database.types";

export const runtime = "nodejs";
export const maxDuration = 60;

const WEBHOOK_SECRET = process.env.SOCIALAPI_WEBHOOK_SECRET;

// The event type rides in the X-SocialAPI-Event header, NOT in the body —
// the body is just the flat data object directly (no {event, data} or
// {event_type, payload} wrapper). Confirmed by logging a real delivery's
// raw bytes; both the "Webhooks" guide and the delivery-record API's
// example shapes turned out not to match what's actually sent over the
// wire.
interface DmReceivedBody {
  id: string;
  platform: string;
  account_id: string;
  author: { id: string };
  content: { text?: string };
}

interface CommentReceivedBody {
  platform: string;
  account_id: string;
  author: { id: string; username?: string };
  content: { text?: string };
}

function toSocialPlatform(platform: string): SocialPlatform | null {
  if (platform === "facebook" || platform === "instagram" || platform === "tiktok" || platform === "youtube") {
    return platform;
  }
  return null;
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-socialapi-signature");
  const eventType = req.headers.get("x-socialapi-event");

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

  const service = createServiceClient();

  if (eventType === "dm.received") {
    const data = JSON.parse(rawBody) as DmReceivedBody;
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

    if (result.classification === "requires_human" && brand.autonomy_enabled) {
      await raiseAutonomyFlag(service, {
        brandId: brand.id,
        brandName: brand.name,
        kind: "inbox_escalation",
        detail: `New ${platform} DM needs a human reply: "${text.slice(0, 200)}"`,
        pauseBrand: false,
      });
    }
  } else if (eventType === "comment.received") {
    const data = JSON.parse(rawBody) as CommentReceivedBody;
    const text = data.content?.text;
    const platform = toSocialPlatform(data.platform);
    if (!text || !platform) return NextResponse.json({ received: true });

    const { data: brand, error: brandError } = await service
      .from("social_brands")
      .select("id, name, autonomy_enabled")
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

    if (brand.autonomy_enabled) {
      await raiseAutonomyFlag(service, {
        brandId: brand.id,
        brandName: brand.name,
        kind: "inbox_escalation",
        detail: `New ${platform} comment needs a human reply: "${text.slice(0, 200)}"`,
        pauseBrand: false,
      });
    }
  }

  return NextResponse.json({ received: true });
}
