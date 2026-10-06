import { generateImage } from "ai";
import type { SocialPlatform } from "@/lib/database.types";
import { brandMediaPolicy } from "@/lib/social/brandMediaPolicy";
import { productSummaryForBrand } from "@/lib/social/productKnowledge";

// Routed through Vercel AI Gateway — plain "provider/model" string,
// authenticated automatically via Vercel OIDC in production, no
// separate API key needed.
const IMAGE_MODEL = "bfl/flux-2-pro";

// Facebook feed images read well square. Instagram's own guidance for
// static feed posts (not Reels/Stories, which need video) is a 4:5
// portrait crop — it fills more of the mobile screen than a square.
// TikTok and YouTube are video-only (no static image posts), so they have
// no real entry here — the UI never calls this for TikTok/YouTube content
// — but the Record still needs every SocialPlatform key, so they fall
// back to a square crop.
const ASPECT_RATIO_BY_PLATFORM: Record<SocialPlatform, `${number}:${number}`> = {
  facebook: "1:1",
  instagram: "4:5",
  tiktok: "1:1",
  youtube: "1:1",
};

const SHAPE_DESCRIPTION_BY_PLATFORM: Record<SocialPlatform, string> = {
  facebook: "square",
  instagram: "portrait",
  tiktok: "square",
  youtube: "square",
};

export interface GeneratedContentImage {
  base64: string;
  mediaType: string;
}

// Brand-aware, product-grounded image prompt (mirrors videoGenerator's
// buildContentVideoPrompt): kids images stay wholesome/on-brand, wellness
// images are calm with no pills/medical imagery, business keeps the clean
// graphic style — all grounded in the real product line. Exported for tests.
export function buildContentImagePrompt(params: {
  brandName: string;
  brandVoiceNotes: string | null;
  hook: string | null;
  caption: string;
  platform: SocialPlatform;
}): string {
  const subject = params.hook || params.caption.slice(0, 200);
  const shape = SHAPE_DESCRIPTION_BY_PLATFORM[params.platform];
  const tone = params.brandVoiceNotes ? `Brand tone: ${params.brandVoiceNotes}. ` : "";
  const brand = params.brandName;
  const { videoStyle } = brandMediaPolicy(brand);
  const products = productSummaryForBrand(brand);
  const grounding = products
    ? `The Revalor product(s) this represents (source: products.revalorllc.com) — ${products}. Depict only the actual app/experience; show no other company or product. `
    : "";
  const noText = "Do not render any text, words, or letters in the image — visual only, no typography.";

  let body: string;
  if (videoStyle === "kids") {
    body = `A clean, bright, wholesome ${shape} social graphic for "${brand}", a mobile app for kids and families. Friendly, colorful, age-appropriate illustration or photo of children and families in positive everyday moments (chores, feelings, focused play) — visual theme: ${subject}. ${tone}Only about ${brand}: no corporate offices, business dashboards, laptops, or any other company, brand, or product. Nothing scary, clinical, or adult.`;
  } else if (videoStyle === "wellness") {
    body = `A calm, serene ${shape} social graphic for "${brand}", a mental-health and mindfulness mobile app. Soft, peaceful imagery — a calm person, gentle nature, a quiet moment of breathing or reflection — visual theme: ${subject}. ${tone}A digital app for wellbeing: do NOT show pills, capsules, supplements, bottles, medication, clinics, or any pharmaceutical, medical, or physical product.`;
  } else {
    body = `A clean, modern ${shape} social media graphic for "${brand}". ${tone}Visual theme: ${subject}. Style: professional, bold, high-contrast, social-media-ready with strong visual focus.`;
  }

  return `${body} ${grounding}${noText}`;
}

export async function generateContentImage(params: {
  brandName: string;
  brandVoiceNotes: string | null;
  hook: string | null;
  caption: string;
  platform: SocialPlatform;
}): Promise<GeneratedContentImage> {
  const aspectRatio = ASPECT_RATIO_BY_PLATFORM[params.platform];
  const prompt = buildContentImagePrompt(params);

  const result = await generateImage({
    model: IMAGE_MODEL,
    prompt,
    aspectRatio,
  });

  return { base64: result.image.base64, mediaType: result.image.mediaType };
}
