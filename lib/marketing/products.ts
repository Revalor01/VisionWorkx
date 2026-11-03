import type { MarketingProduct } from "@/lib/database.types";

// Single source of truth for which products can be marketed to, their
// display name, and how to resolve their audience. Deliberately has zero
// imports beyond the type alias above — MarketingDashboard.tsx (a client
// component) renders its product picker from this file, and anything
// pulling in lib/supabase.ts (which imports next/headers) would break that
// client bundle. Project refs are plain literals for the same reason,
// mirroring revalor-admin/lib/lines.ts's convention — they must match
// REVALOR_KIDS_REF in lib/social/weeklyStats.ts.
export interface MarketingChannels {
  email: boolean;
  push: boolean;
  sms: boolean;
}

// "local" = this app's own Supabase project (service-role client works
// directly). "remote" = a separate Supabase project only reachable via the
// Management API's SQL endpoint (see lib/social/weeklyStats.ts's
// runManagementQuery, same technique used here).
// `schema`: for a product sharing its Supabase project with others (Revalor
// Kids — chorebit / feelflow / mindbit in one project, one shared auth.users),
// its audience is the users with a profile in <schema>.<profileTable> (default
// "profiles"; Revalor Wellness apps use "users_profile"), and its sms_opt_ins
// live in <schema>.sms_opt_ins. Omitted = the whole project.
export type MarketingAudienceSource =
  | { kind: "local" }
  | { kind: "remote"; projectRef: string; schema?: string; profileTable?: string };

/** The table whose rows are a shared project's product members, or null for a whole-project audience. */
export function audienceProfileTable(source: MarketingAudienceSource): string | null {
  if (source.kind !== "remote" || !source.schema) return null;
  return `${source.schema}.${source.profileTable ?? "profiles"}`;
}

// The shared "Revalor Kids" Supabase project (2026-10-11). Must match
// REVALOR_KIDS_REF in lib/social/weeklyStats.ts and revalor-admin/lib/lines.ts.
const REVALOR_KIDS_PROJECT_REF = "uzxspbwpgcmyemqpbgkf";

// The shared "Revalor Wellness" Supabase project (2026-10-16): sanctum,
// proactive and elevate schemas, one shared auth.users. Must match
// revalor-admin/lib/lines.ts. Replaced the old per-app Sanctum and Proactive
// projects, which are being deleted.
const REVALOR_WELLNESS_PROJECT_REF = "eqopjnucrfzlcdfgyhqc";

export interface MarketingProductConfig {
  slug: MarketingProduct;
  name: string;
  channels: MarketingChannels;
  audienceSource: MarketingAudienceSource;
}

// push/sms are true for every product: the sending infrastructure
// (Project 04, lib/mobile/*) is real and product-agnostic, same as email.
// Whether a product currently HAS any opted-in push tokens/phone numbers
// is a separate, audience-level concern — today none do (see
// lib/mobile/audience.ts) — the same distinction Sanctum's email already
// makes: wired, but currently empty. Not hiding the channel keeps that
// visible instead of silently excluding it.
export const MARKETING_PRODUCTS: MarketingProductConfig[] = [
  {
    slug: "visionworkx",
    name: "VisionWorkx",
    channels: { email: true, push: true, sms: true },
    audienceSource: { kind: "local" },
  },
  {
    slug: "chorebit",
    name: "Chorebit",
    channels: { email: true, push: true, sms: true },
    audienceSource: { kind: "remote", projectRef: REVALOR_KIDS_PROJECT_REF, schema: "chorebit" },
  },
  {
    slug: "feelflow",
    name: "FeelFlow",
    channels: { email: true, push: true, sms: true },
    audienceSource: { kind: "remote", projectRef: REVALOR_KIDS_PROJECT_REF, schema: "feelflow" },
  },
  {
    slug: "mindbit",
    name: "MindBit",
    channels: { email: true, push: true, sms: true },
    audienceSource: { kind: "remote", projectRef: REVALOR_KIDS_PROJECT_REF, schema: "mindbit" },
  },
  {
    slug: "sanctum",
    name: "Sanctum",
    channels: { email: true, push: true, sms: true },
    // Members = auth.users with a row in sanctum.users_profile on Revalor Wellness.
    audienceSource: { kind: "remote", projectRef: REVALOR_WELLNESS_PROJECT_REF, schema: "sanctum", profileTable: "users_profile" },
  },
  {
    slug: "proactive",
    name: "Proactive",
    channels: { email: true, push: true, sms: true },
    // Members = auth.users with a row in proactive.users_profile on Revalor Wellness.
    audienceSource: { kind: "remote", projectRef: REVALOR_WELLNESS_PROJECT_REF, schema: "proactive", profileTable: "users_profile" },
  },
];

export const MARKETING_PRODUCT_SLUGS: MarketingProduct[] = MARKETING_PRODUCTS.map((p) => p.slug);

export const PRODUCT_LABEL: Record<MarketingProduct, string> = Object.fromEntries(
  MARKETING_PRODUCTS.map((p) => [p.slug, p.name])
) as Record<MarketingProduct, string>;

export function getMarketingProduct(slug: MarketingProduct): MarketingProductConfig {
  const config = MARKETING_PRODUCTS.find((p) => p.slug === slug);
  if (!config) throw new Error(`Unknown marketing product: ${slug}`);
  return config;
}
