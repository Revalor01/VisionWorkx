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
    tagline: "Describe the app you need. AI builds it.",
    whatItDoes:
      "Allows users to build custom, functional web applications (booking systems, CRMs, invoicing tools, inventory management) using plain English AI prompts. VisionWorkx Automation rides along with every app as a companion built-in feature — instantly emailing customers on bookings and new leads, with self-serve on/off controls right in the dashboard.",
    features: [
      "Describe your app in plain English — AI generates a working app, not just a mockup",
      "VisionWorkx Automation: instant booking and lead emails, no extra setup",
      "Booking, CRM, invoicing, and inventory templates",
      "No code required, ever",
    ],
    targetAudience: "Entrepreneurs, small business owners, and service providers needing custom software without coding.",
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
    ],
    targetAudience: "Founders, managers, and anyone leading a team who wants sharper judgment, not more wellness content.",
  },
  revalor_consulting: {
    name: "Revalor Consulting",
    tagline: "When the brief doesn't fit a prompt.",
    whatItDoes:
      "Discovery, a fixed-scope spec, a build by Revalor's own engineering team, launch, and an optional support arrangement — no outsourced dev, no agency handoffs. For projects beyond what the VisionWorkx self-serve builder covers.",
    features: [
      "Fixed-scope quote, agreed before any build work starts",
      "Revalor's own engineering team, start to finish",
      "The same team behind every live Revalor product",
      "Optional maintenance arrangement after launch",
    ],
    targetAudience: "Businesses that need a custom data model, an unusual workflow, an integration, or a product beyond a self-serve builder.",
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
