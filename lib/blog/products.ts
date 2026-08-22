import type { BlogProductSlug } from "@/lib/database.types";

export type BlogProduct = BlogProductSlug;

export interface ProductConfig {
  name: string;
  niche: string;
  audience: string;
  tone: string;
  seedKeywords: string[];
  url: string;
}

export const PRODUCTS: Record<BlogProduct, ProductConfig> = {
  visionworkx: {
    name: "VisionWorkx",
    niche: "AI-generated web apps for small businesses — booking, CRM, inventory, invoicing",
    audience: "small business owners and solo founders who need custom software without hiring developers",
    tone: "confident, plain-English, practical",
    seedKeywords: [
      "custom app for small business",
      "no code app builder",
      "booking app for small business",
      "small business CRM software",
    ],
    url: "https://vision-workx.vercel.app",
  },
  chorebit: {
    name: "Chorebit",
    niche: "a chores-and-points app that teaches kids financial literacy without using real money",
    audience: "parents wanting to teach responsibility without allowance or screens",
    tone: "warm, practical, parent-to-parent",
    seedKeywords: [
      "chore chart app for kids",
      "teach kids responsibility",
      "chore rewards system",
      "kids chore tracker",
    ],
    url: "https://chorebit.vercel.app",
  },
  feelflow: {
    name: "FeelFlow",
    niche: "a daily emotional check-in app that helps kids recognize and name their feelings",
    audience: "parents wanting to help their kids build emotional intelligence",
    tone: "warm, reassuring, parent-to-parent",
    seedKeywords: [
      "emotional intelligence for kids",
      "feelings chart for kids",
      "help kids express emotions",
      "daily check in app for kids",
    ],
    url: "https://feelflow-eight.vercel.app",
  },
  mindbit: {
    name: "MindBit",
    niche: "three mini-games that build kids' patience, focus, and self-control",
    audience: "parents wanting to build their kids' self-control without lectures or worksheets",
    tone: "warm, practical, parent-to-parent",
    seedKeywords: [
      "build self control in kids",
      "focus games for kids",
      "patience activities for kids",
      "self control activities for children",
    ],
    url: "https://mindbit-one.vercel.app",
  },
  sanctum: {
    name: "Sanctum",
    niche: "a wellness and mental clarity app for guided practices and daily check-ins",
    audience: "individuals wanting to reduce stress and stay grounded in a busy world",
    tone: "calm, grounded, encouraging",
    seedKeywords: [
      "daily mindfulness app",
      "stress reduction app",
      "mental clarity practices",
      "guided calm app",
    ],
    url: "https://revalor-automation.vercel.app/#revalor-wellness",
  },
};

export const PRODUCT_ORDER: BlogProduct[] = ["visionworkx", "chorebit", "feelflow", "mindbit", "sanctum"];

/** Picks the product least recently blogged about, so coverage rotates evenly. */
export function nextProductInRotation(lastPosts: { product: BlogProduct; created_at: string }[]): BlogProduct {
  const lastPostedAt = new Map<BlogProduct, string>();
  for (const p of lastPosts) {
    if (!lastPostedAt.has(p.product)) lastPostedAt.set(p.product, p.created_at);
  }

  let next: BlogProduct = PRODUCT_ORDER[0];
  let oldest = lastPostedAt.get(next) ?? "";
  for (const product of PRODUCT_ORDER) {
    const at = lastPostedAt.get(product) ?? "";
    if (!at) return product; // never posted about — highest priority
    if (at < oldest || !oldest) {
      oldest = at;
      next = product;
    }
  }
  return next;
}
