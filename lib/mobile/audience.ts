import { createServiceClient } from "@/lib/supabase";
import type { MarketingProduct } from "@/lib/database.types";

// Project 04 orientation finding: no product persists a push token or a
// phone number for its own end users anywhere this admin can reach.
// Checked directly: VisionWorkx's own schema has `phone` only on `leads`
// (scraped B2B prospects) and `partner_applications` — unrelated to
// product users. sanctum-web (the current live app, not the dead legacy
// Expo sanctum-app) only has preferences.notification_enabled, an in-app
// boolean toggle, not a stored device token; its emergency_contacts.phone
// is someone else's number for crisis situations, never the user's own.
// Chorebit/FeelFlow/MindBit aren't verifiable from here (no local repo,
// no live Management API access), but nothing in this admin's existing
// code suggests they capture either.
//
// So these return an empty audience with the TODO below rather than
// querying a table that doesn't exist. The moment a product starts
// capturing tokens/phone consent (its own app, not this one — out of
// reach from here), wire that source in here the same way
// lib/marketing/audience.ts resolves email: local products via this
// service client, remote products via the Management API.

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

// TODO(mobile-sms-audience): wire once a product captures SMS consent +
// phone number somewhere this admin can reach. When it does, this should
// still call filterSmsOptOuts() below before returning — opt-out
// enforcement is real today even though the audience source isn't yet.
export async function getSmsAudience(_product: MarketingProduct): Promise<SmsAudienceMember[]> {
  return [];
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
