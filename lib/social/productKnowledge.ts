import type { SocialVideoProduct } from "@/lib/database.types";

export interface ProductKnowledge {
  name: string;
  tagline: string;
  whatItDoes: string;
  features: string[];
  targetAudience: string;
}

// Static snapshot of each product's real marketing copy — sourced from
// products.revalorllc.com so Media Studio's "Suggest content" button (see
// lib/social/studioSubjectGenerator.ts) has accurate subject matter to draw
// variations from, instead of the admin having to hand-write every video
// prompt from scratch. Deliberately not fetched live: a static snapshot
// matches how social_brands.voice_notes/faq_document already work (no
// extra latency or failure point on every generation), at the cost of
// needing a manual refresh here if the site's copy changes.
export const PRODUCT_KNOWLEDGE: Record<SocialVideoProduct, ProductKnowledge | null> = {
  visionworkx: {
    name: "VisionWorkx",
    tagline: "Add booking, lead capture and automatic follow-up to the website you already have. Just describe it.",
    whatItDoes:
      "Ready-made modules — lead capture, online booking, quote calculator, intake form, and a dashboard for every submission — that install on your existing WordPress, Squarespace, Wix, Webflow, Framer, or Shopify site with one line of code. Describe what you need in plain English; VisionWorkx sets the module up for you to adjust and paste in. VisionWorkx Automation is included with every module: an instant confirmation email to your customer and an alert to you the moment a submission arrives, no setup, no add-on.",
    features: [
      "Lead capture forms, online booking, quote/estimate calculator, and client intake forms",
      "One dashboard for every submission",
      "Installs on WordPress, Squarespace, Wix, Webflow, Framer & Shopify with one line of code — no rebuild",
      "VisionWorkx Automation included with every module: instant customer confirmation + owner alert",
      "Plans: Starter $59/mo (1,000 emails/mo), Growth $129/mo (5,000), Pro $299/mo (20,000); every plan starts with a 14-day free trial; save 20% paying yearly",
    ],
    targetAudience:
      "Small business owners and service providers who already have a website and want it to capture leads and bookings — without rebuilding it or hiring a developer.",
  },
  proactive: {
    name: "Proactive",
    tagline: "Clarity, leadership, and growth for people who run things.",
    whatItDoes:
      "Gives leaders a daily practice for clearer thinking — leadership prompts across decisiveness, organization, problem-solving, and resource management, plus Collaborator, an AI coach to talk a hard call through in your own words.",
    features: [
      "Collaborator, an AI leadership coach — talk through a hard call in your own words",
      "Daily leadership prompts across decisiveness, organization, problem-solving, resource management",
      "Guided decision reflections and focus sessions, not generic wellness content",
      "The same grounded stress-response toolkit as Sanctum, for pressure moments leaders have too",
    ],
    targetAudience: "Founders, managers, and anyone leading a team who wants sharper judgment, not more wellness content.",
  },
  revalor_consulting: {
    name: "Revalor Consulting",
    tagline: "Need something built entirely custom?",
    whatItDoes:
      "Scopes, designs, and deploys bespoke web applications from the ground up: discovery, a fixed-scope spec, a build by Revalor's own engineering team, launch, and an optional support arrangement — no outsourced dev, no agency handoffs. For projects beyond what VisionWorkx's ready-made modules cover.",
    features: [
      "Fixed-scope quote, agreed before any build work starts",
      "Revalor's own engineering team, start to finish",
      "The same team behind six live Revalor products",
      "Optional maintenance arrangement after launch",
      "Can include VisionWorkx modules installed on your existing site",
    ],
    targetAudience:
      "Businesses that need a custom data model, an unusual workflow, an integration, or a product beyond what VisionWorkx's ready-made modules cover.",
  },
  chorebit: {
    name: "Chorebit",
    tagline: "Do chores. Earn points. Reach goals.",
    whatItDoes:
      "Helps kids track daily chores and earn parent-approved points toward savings goals they select themselves — turning chores into real savings habits without using real money.",
    features: [
      "Parent-approved points, never real money",
      "Kids track their own goals and progress",
      "Simple, focused kid mode for daily chores",
    ],
    targetAudience: "Families wanting to teach financial literacy and responsibility without using real money.",
  },
  feelflow: {
    name: "FeelFlow",
    tagline: "Feel it. Name it. Grow from it.",
    whatItDoes:
      "Guides kids through simple, game-based check-ins that build emotional vocabulary and self-awareness, with a PIN-protected parent dashboard showing patterns over time.",
    features: [
      "Kid-friendly emotional check-ins",
      "Parent dashboard behind a PIN, not open access",
      "Builds vocabulary for naming feelings",
    ],
    targetAudience: "Families wanting to help kids build emotional intelligence and communicate feelings more easily.",
  },
  mindbit: {
    name: "MindBit",
    tagline: "Self-control. Focus. Grow strong.",
    whatItDoes:
      "Three focused mini-games — The Wait Game, Calm Ball, and Breathe with Blaze — each tracked in a PIN-protected parent dashboard with game-specific insights, teaching the psychology of self-control through play.",
    features: [
      "The Wait Game — patience pays off, literally",
      "Calm Ball — steady rhythm builds focus",
      "Breathe with Blaze — guided breathing with a dragon",
    ],
    targetAudience: "Families wanting to help kids build patience, focus, and emotional regulation through play.",
  },
  sanctum: {
    name: "Sanctum",
    tagline: "Peace opens the door to strength.",
    whatItDoes:
      "Provides guided practices for focus and calm, alongside daily check-ins designed for simplicity rather than gamification. Tessa, an AI companion, talks through what's on your mind, with voice guidance that reads her replies and narrates the app aloud.",
    features: [
      "Guided practices for focus and calm",
      "Daily check-ins that actually fit your life",
      "Tessa, an AI companion — talk through what's on your mind",
      "Voice guidance reads Tessa's replies and narrates the app aloud",
    ],
    targetAudience: "Individuals seeking to reduce stress, reset, and maintain mindfulness in a fast-paced environment.",
  },
  // No single product — company-wide angle, so no product-specific knowledge to draw from.
  revalor: null,
};

// Which products each social_brands row speaks for, keyed by brand name -
// the same brand/product matrix Media Studio uses (see
// app/api/social/video-assets/studio-generate/route.ts). Brands not listed
// (e.g. "Revalor LLC") get no product facts and rely on their voice notes.
const BRAND_PRODUCTS: Record<string, SocialVideoProduct[]> = {
  VisionWorkx: ["visionworkx"],
  "Revalor Business": ["visionworkx", "proactive", "revalor_consulting"],
  "Revalor Kids": ["chorebit", "feelflow", "mindbit"],
  "Revalor Wellness": ["sanctum"],
};

export function formatProductKnowledge(product: SocialVideoProduct): string | null {
  const k = PRODUCT_KNOWLEDGE[product];
  if (!k) return null;
  return `${k.name} — "${k.tagline}"
What it does: ${k.whatItDoes}
Features:
${k.features.map((f) => `- ${f}`).join("\n")}
Target audience: ${k.targetAudience}`;
}

// Current product facts for a brand, for grounding generated posts so stale
// voice notes can't pull them back toward retired positioning. null when the
// brand has no product mapping.
export function productFactsForBrand(brandName: string): string | null {
  const facts = (BRAND_PRODUCTS[brandName] ?? []).map(formatProductKnowledge).filter((f): f is string => f !== null);
  return facts.length > 0 ? facts.join("\n\n") : null;
}
