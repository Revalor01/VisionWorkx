import type { MarketingProduct } from "@/lib/database.types";

// Single source of truth for which products can be marketed to, their
// display name, and how to resolve their audience. Deliberately has zero
// imports beyond the type alias above — MarketingDashboard.tsx (a client
// component) renders its product picker from this file, and anything
// pulling in lib/supabase.ts (which imports next/headers) would break that
// client bundle. Project refs are plain literals for the same reason,
// mirroring revalor-admin/lib/lines.ts's convention — they must match
// CHOREBIT_REF / FEELFLOW_REF / MINDBIT_REF in lib/social/weeklyStats.ts.
export interface MarketingChannels {
  email: boolean;
  push: boolean;
  sms: boolean;
}

// "local" = this app's own Supabase project (service-role client works
// directly). "remote" = a separate Supabase project only reachable via the
// Management API's SQL endpoint (see lib/social/weeklyStats.ts's
// runManagementQuery, same technique used here).
export type MarketingAudienceSource = { kind: "local" } | { kind: "remote"; projectRef: string };

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
    audienceSource: { kind: "remote", projectRef: "kkpwgnmhtcidnrnlwcll" },
  },
  {
    slug: "feelflow",
    name: "FeelFlow",
    channels: { email: true, push: true, sms: true },
    audienceSource: { kind: "remote", projectRef: "duiyxiransdeqokwldqy" },
  },
  {
    slug: "mindbit",
    name: "MindBit",
    channels: { email: true, push: true, sms: true },
    audienceSource: { kind: "remote", projectRef: "uftlgnmvjjmuedotrewz" },
  },
  {
    slug: "sanctum",
    name: "Sanctum",
    channels: { email: true, push: true, sms: true },
    // Project ref from revalor-admin/lib/lines.ts (supabaseRef for sanctum).
    // Reached the same way as the other remote products — auth.users via
    // the Management API — since sanctum-web is a standard Supabase Auth
    // project; its custom users_profile table (subscription_tier) is layered
    // on top of auth.users, not a replacement for it.
    audienceSource: { kind: "remote", projectRef: "qpbwnfvdjklmdrftbkcu" },
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
