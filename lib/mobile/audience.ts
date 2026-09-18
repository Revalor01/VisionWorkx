import { createServiceClient } from "@/lib/supabase";
import { runManagementQuery } from "@/lib/social/weeklyStats";
import { getMarketingProduct } from "@/lib/marketing/products";
import type { MarketingProduct } from "@/lib/database.types";

// Project 04 orientation finding: no product persisted a push token or a
// phone number for its own end users anywhere this admin could reach.
// VisionWorkx now does for SMS — migration 48's sms_opt_ins, backing a
// real opt-in flow at /notifications (RLS-gated, written by the end user
// themselves). Chorebit/FeelFlow/MindBit/Sanctum each got the same
// /notifications + sms_opt_ins pattern in their own repos/Supabase
// projects, read here the same way lib/marketing/audience.ts already
// reads their email audiences: local via this service client, remote via
// the Management API (lib/social/weeklyStats.ts's runManagementQuery),
// using each product's audienceSource from lib/marketing/products.ts.
// Push is still genuinely unreached — no product persists a push token
// anywhere yet — see getPushAudience's own TODO below.

export interface PushAudienceMember {
  id: string;
  token: string;
}

export interface SmsAudienceMember {
  id: string;
  phone: string;
}

// TODO(mobile-push-audience): wire once a product persists Expo/FCM push
// tokens somewhere this admin can reach.
export async function getPushAudience(_product: MarketingProduct): Promise<PushAudienceMember[]> {
  return [];
}

// Callers still run filterSmsOptOuts() on the result, so a STOP reply is
// honored regardless of which product's sms_opt_ins the phone came from.
export async function getSmsAudience(product: MarketingProduct): Promise<SmsAudienceMember[]> {
  const { audienceSource } = getMarketingProduct(product);

  if (audienceSource.kind === "local") {
    const service = createServiceClient();
    const { data, error } = await service.from("sms_opt_ins").select("user_id, phone");
    if (error) throw error;
    return (data ?? []).map((r) => ({ id: r.user_id, phone: r.phone }));
  }

  // Rollout is staged per product (separate repo, separate PR, separate
  // migration to apply) — a remote product's sms_opt_ins table may not
  // exist yet. Treat that as "no audience yet" rather than letting one
  // unmigrated product break every other product's audience count.
  let rows: Record<string, unknown>[];
  try {
    rows = await runManagementQuery(audienceSource.projectRef, "SELECT user_id, phone FROM sms_opt_ins");
  } catch {
    return [];
  }

  return rows
    .filter((r): r is { user_id: string; phone: string } => typeof r.user_id === "string" && typeof r.phone === "string")
    .map((r) => ({ id: r.user_id, phone: r.phone }));
}

async function getOptedOutPhones(): Promise<Set<string>> {
  const service = createServiceClient();
  const { data, error } = await service.from("mobile_sms_opt_outs").select("phone");
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.phone));
}

// Global by phone number (see migration 45's comment) — unlike email's
// per-product filterUnsubscribed, this isn't scoped to a product.
export async function filterSmsOptOuts(phones: string[]): Promise<string[]> {
  const optedOut = await getOptedOutPhones();
  return phones.filter((p) => !optedOut.has(p));
}
