import { createServiceClient } from "@/lib/supabase";
import type { MarketingProduct } from "@/lib/database.types";

// Project 04 orientation finding: no product persisted a push token or a
// phone number for its own end users anywhere this admin could reach.
// VisionWorkx now does for SMS — migration 48's sms_opt_ins, backing a
// real opt-in flow at /notifications (RLS-gated, written by the end user
// themselves; read here via the service client the same way every other
// local-product query in this admin does). Push, and SMS for the other
// four products, are still genuinely unreached: no push token store
// exists anywhere, and Chorebit/FeelFlow/MindBit/Sanctum aren't
// verifiable from here (no local repo, no live Management API access)
// but nothing suggests they capture SMS consent either. Those keep
// returning an empty audience with a TODO rather than querying a table
// that doesn't exist — same reach pattern as lib/marketing/audience.ts
// once they do: local products via this service client, remote via the
// Management API.

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

// TODO(mobile-sms-audience): wire the other 4 products once each captures
// SMS consent somewhere this admin can reach — VisionWorkx is done
// (migration 48, /notifications). Callers still run filterSmsOptOuts() on
// the result, so a STOP reply is honored regardless of source.
export async function getSmsAudience(product: MarketingProduct): Promise<SmsAudienceMember[]> {
  if (product !== "visionworkx") return [];

  const service = createServiceClient();
  const { data, error } = await service.from("sms_opt_ins").select("user_id, phone");
  if (error) throw error;

  return (data ?? []).map((r) => ({ id: r.user_id, phone: r.phone }));
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
