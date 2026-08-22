import { generateImage } from "ai";
import type { SocialPlatform } from "@/lib/database.types";

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

export async function generateContentImage(params: {
  brandName: string;
  brandVoiceNotes: string | null;
  hook: string | null;
  caption: string;
  platform: SocialPlatform;
}): Promise<GeneratedContentImage> {
  const subject = params.hook || params.caption.slice(0, 200);
  const aspectRatio = ASPECT_RATIO_BY_PLATFORM[params.platform];
  const shape = SHAPE_DESCRIPTION_BY_PLATFORM[params.platform];

  const prompt = `A clean, modern social media graphic promoting "${params.brandName}", a software product. ${
    params.brandVoiceNotes ? `Brand tone: ${params.brandVoiceNotes}. ` : ""
  }Visual theme: ${subject}. Style: professional, bold, high-contrast, social-media-ready ${shape} image with strong visual focus. Do not render any text, words, or letters in the image — visual only, no typography.`;

  const result = await generateImage({
    model: IMAGE_MODEL,
    prompt,
    aspectRatio,
  });

  return { base64: result.image.base64, mediaType: result.image.mediaType };
}
