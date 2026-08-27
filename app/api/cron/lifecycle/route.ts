import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { LIFECYCLE_TRIGGERS, type LifecycleTriggerId } from "@/lib/lifecycle/triggers";
import { findQualifyingUsers } from "@/lib/lifecycle/evaluate";
import { claimLifecycleFires, linkLifecycleFires } from "@/lib/lifecycle/dedupe";
import { filterUnsubscribed } from "@/lib/marketing/audience";
import { generateEmailCampaign } from "@/lib/marketing/emailGenerator";
import { sendCampaign } from "@/lib/marketing/sendCampaign";
import { sendReviewAlert } from "@/lib/marketing/alerts";
import { PRODUCT_LABEL } from "@/lib/marketing/products";
import type { MarketingAutonomy, MarketingProduct } from "@/lib/database.types";

export const runtime = "nodejs";
export const maxDuration = 300;

// Seeds the generator's prompt per trigger — same generateEmailCampaign()
// Project 02 already built, not a separate lifecycle-specific generator.
const TRIGGER_GOAL: Record<LifecycleTriggerId, string> = {
  welcome: "Write a warm welcome email for someone who just signed up.",
  activation_nudge:
    "Write a friendly, low-pressure nudge for someone who signed up a few days ago but hasn't come back yet — encourage them to take their first real step in the product.",
  win_back_30: "Write a re-engagement email for someone who hasn't been active in about a month.",
  win_back_60: "Write a re-engagement email for someone who hasn't been active in about two months.",
  win_back_90: "Write a re-engagement email for someone who hasn't been active in about three months — acknowledge it's been a while, no guilt-tripping.",
  vw_first_deploy: "Write a short, genuinely congratulatory email for someone who just deployed their first app.",
};

interface RunResult {
  trigger: string;
  product: MarketingProduct;
  qualifying: number;
  claimed: number;
  outcome: "sent" | "pending_review" | "skipped" | "failed";
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
      try {
        const qualifying = await findQualifyingUsers(trigger.id, product);
        if (qualifying.length === 0) continue;

        const eligibleEmails = await filterUnsubscribed(product, qualifying.map((u) => u.email));
        if (eligibleEmails.length === 0) {
          results.push({ trigger: trigger.id, product, qualifying: qualifying.length, claimed: 0, outcome: "skipped" });
          continue;
        }

        // Claim dedupe slots before generating/sending anything — a
        // generation or send failure after this point leaves those emails
        // claimed (not retried next run), which is the right tradeoff for
        // "never send the same lifecycle email twice" over "always
        // eventually deliver."
        const claimed = await claimLifecycleFires({ triggerId: trigger.id, product, emails: eligibleEmails });
        if (claimed.length === 0) {
          results.push({ trigger: trigger.id, product, qualifying: qualifying.length, claimed: 0, outcome: "skipped" });
          continue;
        }

        const goal = TRIGGER_GOAL[trigger.id];
        const email = await generateEmailCampaign({ productLabel: PRODUCT_LABEL[product], voiceNotes: null, goal });

        const { data: campaign, error: insertError } = await service
          .from("marketing_campaigns")
          .insert({
            product,
            subject: email.subject,
            body_html: email.bodyHtml,
            status: autonomy === "auto" ? "generated" : "pending_review",
            recipient_count: claimed.length,
            autonomy,
            goal,
            target_emails: claimed,
          })
          .select("id")
          .single();
        if (insertError || !campaign) {
          console.error(`[cron/lifecycle] failed to log campaign for ${trigger.id}/${product}:`, insertError?.message);
          results.push({ trigger: trigger.id, product, qualifying: qualifying.length, claimed: claimed.length, outcome: "failed" });
          continue;
        }

        await linkLifecycleFires({ triggerId: trigger.id, product, emails: claimed, campaignId: campaign.id });

        if (autonomy === "auto") {
          await sendCampaign(campaign.id, claimed);
          results.push({ trigger: trigger.id, product, qualifying: qualifying.length, claimed: claimed.length, outcome: "sent" });
        } else {
          await sendReviewAlert({ productName: PRODUCT_LABEL[product], subject: email.subject, campaignId: campaign.id });
          results.push({ trigger: trigger.id, product, qualifying: qualifying.length, claimed: claimed.length, outcome: "pending_review" });
        }
      } catch (err) {
        console.error(`[cron/lifecycle] failed for ${trigger.id}/${product}:`, err);
        results.push({ trigger: trigger.id, product, qualifying: 0, claimed: 0, outcome: "failed" });
      }
    }
  }

  return NextResponse.json({ results });
}
