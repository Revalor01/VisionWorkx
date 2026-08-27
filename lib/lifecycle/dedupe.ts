import { createServiceClient } from "@/lib/supabase";
import type { LifecycleTriggerId } from "./triggers";
import type { MarketingProduct } from "@/lib/database.types";

// Claims a slot for each (trigger, product, email) by inserting into
// lifecycle_fires with ignoreDuplicates — the unique constraint means a
// row that already exists (this run or a previous one already claimed it)
// is silently skipped rather than erroring, and PostgREST only returns the
// rows it actually inserted. That's what makes the returned list the
// "actually newly claimed, safe to send to" set even if this route runs
// concurrently with itself.
export async function claimLifecycleFires(params: {
  triggerId: LifecycleTriggerId;
  product: MarketingProduct;
  emails: string[];
}): Promise<string[]> {
  const { triggerId, product, emails } = params;
  if (emails.length === 0) return [];

  const service = createServiceClient();
  const { data, error } = await service
    .from("lifecycle_fires")
    .upsert(
      emails.map((email) => ({ trigger_id: triggerId, product, recipient_email: email })),
      { onConflict: "trigger_id,product,recipient_email", ignoreDuplicates: true }
    )
    .select("recipient_email");
  if (error) throw error;

  return (data ?? []).map((r) => r.recipient_email);
}

// Backfills campaign_id once the campaign row those claimed fires belong
// to actually exists (claiming has to happen before generation so a
// generation failure doesn't leave the dedupe un-claimed and re-fireable).
export async function linkLifecycleFires(params: {
  triggerId: LifecycleTriggerId;
  product: MarketingProduct;
  emails: string[];
  campaignId: string;
}): Promise<void> {
  const service = createServiceClient();
  await service
    .from("lifecycle_fires")
    .update({ campaign_id: params.campaignId })
    .eq("trigger_id", params.triggerId)
    .eq("product", params.product)
    .in("recipient_email", params.emails);
}
