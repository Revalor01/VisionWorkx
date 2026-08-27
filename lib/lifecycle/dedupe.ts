import { createServiceClient } from "@/lib/supabase";
import type { LifecycleTriggerId } from "./triggers";
import type { MarketingChannel, MarketingProduct } from "@/lib/database.types";

// Claims a slot for each (trigger, product, channel, recipient) by
// inserting into lifecycle_fires with ignoreDuplicates — the unique
// constraint means a row that already exists (this run or a previous one
// already claimed it) is silently skipped rather than erroring, and
// PostgREST only returns the rows it actually inserted. That's what makes
// the returned list the "actually newly claimed, safe to send to" set
// even if this route runs concurrently with itself. `recipient` is an
// email for channel="email", a push token for "push", a phone number for
// "sms" — same trigger+product dedupes independently per channel, so a
// win-back email and a win-back push to the same user don't collide.
export async function claimLifecycleFires(params: {
  triggerId: LifecycleTriggerId;
  product: MarketingProduct;
  channel: MarketingChannel;
  recipients: string[];
}): Promise<string[]> {
  const { triggerId, product, channel, recipients } = params;
  if (recipients.length === 0) return [];

  const service = createServiceClient();
  const { data, error } = await service
    .from("lifecycle_fires")
    .upsert(
      recipients.map((recipient) => ({ trigger_id: triggerId, product, channel, recipient })),
      { onConflict: "trigger_id,product,channel,recipient", ignoreDuplicates: true }
    )
    .select("recipient");
  if (error) throw error;

  return (data ?? []).map((r) => r.recipient);
}

// Backfills campaign_id once the campaign row those claimed fires belong
// to actually exists (claiming has to happen before generation so a
// generation failure doesn't leave the dedupe un-claimed and re-fireable).
export async function linkLifecycleFires(params: {
  triggerId: LifecycleTriggerId;
  product: MarketingProduct;
  channel: MarketingChannel;
  recipients: string[];
  campaignId: string;
}): Promise<void> {
  const service = createServiceClient();
  await service
    .from("lifecycle_fires")
    .update({ campaign_id: params.campaignId })
    .eq("trigger_id", params.triggerId)
    .eq("product", params.product)
    .eq("channel", params.channel)
    .in("recipient", params.recipients);
}
