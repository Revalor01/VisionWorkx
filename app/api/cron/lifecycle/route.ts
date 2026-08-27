import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { LIFECYCLE_TRIGGERS, type LifecycleTriggerId } from "@/lib/lifecycle/triggers";
import { findQualifyingUsers, type QualifyingUser } from "@/lib/lifecycle/evaluate";
import { claimLifecycleFires, linkLifecycleFires } from "@/lib/lifecycle/dedupe";
import { filterUnsubscribed } from "@/lib/marketing/audience";
import { generateEmailCampaign } from "@/lib/marketing/emailGenerator";
import { sendCampaign } from "@/lib/marketing/sendCampaign";
import { sendReviewAlert } from "@/lib/marketing/alerts";
import { PRODUCT_LABEL } from "@/lib/marketing/products";
import { getPushAudience, getSmsAudience, filterSmsOptOuts } from "@/lib/mobile/audience";
import { generatePushCampaign, generateSmsCampaign } from "@/lib/mobile/generator";
import { sendMobileCampaign } from "@/lib/mobile/sendCampaign";
import type { MarketingAutonomy, MarketingChannel, MarketingProduct } from "@/lib/database.types";

export const runtime = "nodejs";
export const maxDuration = 300;

// Seeds the generator's prompt per trigger — same generate*Campaign()
// functions Projects 02/04 already built, not separate lifecycle-specific
// generators.
const TRIGGER_GOAL: Record<LifecycleTriggerId, string> = {
  welcome: "Write a warm welcome message for someone who just signed up.",
  activation_nudge:
    "Write a friendly, low-pressure nudge for someone who signed up a few days ago but hasn't come back yet — encourage them to take their first real step in the product.",
  win_back_30: "Write a re-engagement message for someone who hasn't been active in about a month.",
  win_back_60: "Write a re-engagement message for someone who hasn't been active in about two months.",
  win_back_90: "Write a re-engagement message for someone who hasn't been active in about three months — acknowledge it's been a while, no guilt-tripping.",
  vw_first_deploy: "Write a short, genuinely congratulatory message for someone who just deployed their first app.",
};

interface RunResult {
  trigger: string;
  product: MarketingProduct;
  channel: MarketingChannel;
  qualifying: number;
  claimed: number;
  outcome: "sent" | "pending_review" | "skipped" | "failed";
}

// A lifecycle trigger targets specific qualifying users, not "the whole
// product audience" — for email that means filtering to just their
// (already-unsubscribe-filtered) addresses. Push/SMS resolve to 0 today
// (see lib/mobile/audience.ts: no product captures tokens/consent yet).
// TODO(mobile-lifecycle): once those resolvers are real, intersect with
// `qualifying`'s user ids instead of the product's whole push/SMS
// audience — this call site should not start blasting a lifecycle
// message to everyone opted in.
async function resolveChannelRecipients(channel: MarketingChannel, product: MarketingProduct, qualifying: QualifyingUser[]): Promise<string[]> {
  if (channel === "email") {
    return filterUnsubscribed(product, qualifying.map((u) => u.email));
  }
  if (channel === "push") {
    return (await getPushAudience(product)).map((r) => r.token);
  }
  return filterSmsOptOuts((await getSmsAudience(product)).map((r) => r.phone));
}

async function generateForChannel(channel: MarketingChannel, productLabel: string, goal: string): Promise<{ subject: string; body: string }> {
  if (channel === "email") {
    const email = await generateEmailCampaign({ productLabel, voiceNotes: null, goal });
    return { subject: email.subject, body: email.bodyHtml };
  }
  if (channel === "push") {
    const push = await generatePushCampaign({ productLabel, voiceNotes: null, goal });
    return { subject: push.title, body: push.body };
  }
  const sms = await generateSmsCampaign({ productLabel, voiceNotes: null, goal });
  return { subject: "", body: sms.body };
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = createServiceClient();
  const { data: settingsRows, error: settingsError } = await service.from("lifecycle_trigger_settings").select("*");
  if (settingsError) return NextResponse.json({ error: settingsError.message }, { status: 500 });
  const settingsByTrigger = new Map((settingsRows ?? []).map((s) => [s.trigger_id, s]));

  const results: RunResult[] = [];

  for (const trigger of LIFECYCLE_TRIGGERS) {
    const settings = settingsByTrigger.get(trigger.id);
    if (settings && !settings.active) continue;
    const autonomy: MarketingAutonomy = settings?.autonomy ?? trigger.defaultAutonomy;

    for (const product of trigger.products) {
      const qualifying = await findQualifyingUsers(trigger.id, product);
      if (qualifying.length === 0) continue;

      for (const channel of trigger.channels) {
        try {
          const eligible = await resolveChannelRecipients(channel, product, qualifying);
          if (eligible.length === 0) {
            results.push({ trigger: trigger.id, product, channel, qualifying: qualifying.length, claimed: 0, outcome: "skipped" });
            continue;
          }

          // Claim dedupe slots before generating/sending anything — a
          // generation or send failure after this point leaves those
          // recipients claimed (not retried next run), the right tradeoff
          // for "never send the same lifecycle message twice" over
          // "always eventually deliver."
          const claimed = await claimLifecycleFires({ triggerId: trigger.id, product, channel, recipients: eligible });
          if (claimed.length === 0) {
            results.push({ trigger: trigger.id, product, channel, qualifying: qualifying.length, claimed: 0, outcome: "skipped" });
            continue;
          }

          const goal = TRIGGER_GOAL[trigger.id];
          const productLabel = PRODUCT_LABEL[product];
          const { subject, body } = await generateForChannel(channel, productLabel, goal);

          const { data: campaign, error: insertError } = await service
            .from("marketing_campaigns")
            .insert({
              product,
              channel,
              subject,
              body_html: body,
              status: autonomy === "auto" ? "generated" : "pending_review",
              recipient_count: claimed.length,
              autonomy,
              goal,
              target_emails: claimed,
            })
            .select("id")
            .single();
          if (insertError || !campaign) {
            console.error(`[cron/lifecycle] failed to log campaign for ${trigger.id}/${product}/${channel}:`, insertError?.message);
            results.push({ trigger: trigger.id, product, channel, qualifying: qualifying.length, claimed: claimed.length, outcome: "failed" });
            continue;
          }

          await linkLifecycleFires({ triggerId: trigger.id, product, channel, recipients: claimed, campaignId: campaign.id });

          if (autonomy === "auto") {
            if (channel === "email") await sendCampaign(campaign.id, claimed);
            else await sendMobileCampaign(campaign.id, claimed);
            results.push({ trigger: trigger.id, product, channel, qualifying: qualifying.length, claimed: claimed.length, outcome: "sent" });
          } else {
            await sendReviewAlert({ productName: productLabel, subject: subject || body, campaignId: campaign.id });
            results.push({ trigger: trigger.id, product, channel, qualifying: qualifying.length, claimed: claimed.length, outcome: "pending_review" });
          }
        } catch (err) {
          console.error(`[cron/lifecycle] failed for ${trigger.id}/${product}/${channel}:`, err);
          results.push({ trigger: trigger.id, product, channel, qualifying: qualifying.length, claimed: 0, outcome: "failed" });
        }
      }
    }
  }

  return NextResponse.json({ results });
}
