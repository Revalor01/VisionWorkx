import { MARKETING_PRODUCT_SLUGS } from "@/lib/marketing/products";
import type { MarketingAutonomy, MarketingChannel, MarketingProduct } from "@/lib/database.types";

// What data is actually reachable today (orientation finding, Project 03):
// none of the 5 products push events to this admin — there's no shared
// events table or webhook, only each product's own Supabase project. But
// every product is a standard Supabase Auth project, so auth.users'
// created_at / last_sign_in_at are real, verifiable, product-agnostic
// signals reachable the same way lib/marketing/audience.ts already reaches
// them (service client for the local project, the Management API for the
// other four). That's what welcome / activation_nudge / win_back_* are
// evaluated against — a cron scan, not real event ingestion, because
// nothing pushes events today (see app/api/cron/lifecycle).
//
// Milestones are genuinely product-specific (streaks, check-in counts,
// achievements) and none of that schema is verifiable from here for the
// four remote products — only VisionWorkx's own `apps` table (this same
// codebase) is. So there's exactly one milestone trigger for now,
// scoped to VisionWorkx. Upgrade path: once a product exposes real
// per-product activity (or starts pushing events to a future
// /api/events endpoint), add its milestone trigger + evaluator here
// without touching the trigger-definition shape.
export type LifecycleTriggerId = "welcome" | "activation_nudge" | "win_back_30" | "win_back_60" | "win_back_90" | "vw_first_deploy";

// Channel-agnostic in shape on purpose (Project 03) — Project 04 adds the
// actual `channels` a trigger fires through. Push/SMS resolve to 0
// recipients today (see lib/mobile/audience.ts: no product captures
// tokens/consent), so registering a trigger for push/sms is real, correct
// wiring that simply has nobody to reach yet — same posture as the rest
// of Project 04, not speculative.
export interface LifecycleTrigger {
  id: LifecycleTriggerId;
  name: string;
  description: string;
  products: MarketingProduct[];
  channels: MarketingChannel[];
  defaultAutonomy: MarketingAutonomy;
}

export const LIFECYCLE_TRIGGERS: LifecycleTrigger[] = [
  {
    id: "welcome",
    name: "Welcome series",
    description: "Fires once for accounts created in the last 48 hours.",
    products: MARKETING_PRODUCT_SLUGS,
    channels: ["email", "push", "sms"],
    defaultAutonomy: "manual",
  },
  {
    id: "activation_nudge",
    name: "Activation nudge",
    description: "Signed up 3+ days ago and never signed back in.",
    products: MARKETING_PRODUCT_SLUGS,
    channels: ["email", "push", "sms"],
    defaultAutonomy: "manual",
  },
  {
    id: "win_back_30",
    name: "Inactivity win-back (30d)",
    description: "No sign-in in 30+ days.",
    products: MARKETING_PRODUCT_SLUGS,
    channels: ["email", "push", "sms"],
    defaultAutonomy: "manual",
  },
  {
    id: "win_back_60",
    name: "Inactivity win-back (60d)",
    description: "No sign-in in 60+ days.",
    products: MARKETING_PRODUCT_SLUGS,
    channels: ["email", "push", "sms"],
    defaultAutonomy: "manual",
  },
  {
    id: "win_back_90",
    name: "Inactivity win-back (90d)",
    description: "No sign-in in 90+ days.",
    products: MARKETING_PRODUCT_SLUGS,
    channels: ["email", "push", "sms"],
    defaultAutonomy: "manual",
  },
  {
    id: "vw_first_deploy",
    name: "First app deployed",
    description: "VisionWorkx only — congratulates a user the first time one of their apps reaches status=deployed.",
    products: ["visionworkx"],
    // Push suits a quick congrats; SMS is tastefully skipped here.
    channels: ["email", "push"],
    defaultAutonomy: "manual",
  },
];

export function getLifecycleTrigger(id: LifecycleTriggerId): LifecycleTrigger {
  const trigger = LIFECYCLE_TRIGGERS.find((t) => t.id === id);
  if (!trigger) throw new Error(`Unknown lifecycle trigger: ${id}`);
  return trigger;
}
