import { generateImage } from "ai";

// Routed through Vercel AI Gateway — plain "provider/model" string,
// authenticated automatically via Vercel OIDC in production, no
// separate API key needed.
const IMAGE_MODEL = "bfl/flux-2-pro";

export interface GeneratedContentImage {
  base64: string;
  mediaType: string;
}

export async function generateContentImage(params: {
  brandName: string;
  brandVoiceNotes: string | null;
  hook: string | null;
  caption: string;
}): Promise<GeneratedContentImage> {
  const subject = params.hook || params.caption.slice(0, 200);

  const prompt = `A clean, modern social media graphic promoting "${params.brandName}", a software product. ${
    params.brandVoiceNotes ? `Brand tone: ${params.brandVoiceNotes}. ` : ""
  }Visual theme: ${subject}. Style: professional, bold, high-contrast, social-media-ready square image with strong visual focus. Do not render any text, words, or letters in the image — visual only, no typography.`;

  const result = await generateImage({
    model: IMAGE_MODEL,
    prompt,
    aspectRatio: "1:1",
  });

  return { base64: result.image.base64, mediaType: result.image.mediaType };
}
