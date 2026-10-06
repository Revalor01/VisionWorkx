import { experimental_generateVideo as generateVideo } from "ai";
import { brandMediaPolicy } from "@/lib/social/brandMediaPolicy";
import { productSummaryForBrand } from "@/lib/social/productKnowledge";

// Same model/gateway as recapVideoGenerator.ts — Kling v2.6, routed through
// Vercel AI Gateway. Real cost: ~$0.84/video at 10s/9:16/pro-with-audio
// (checked via the existing spend dashboard before adding this).
const VIDEO_MODEL = "klingai/kling-v2.6-t2v";

// Kling v2.6 only accepts duration 5 or 10 — Media Studio needs a real
// length control (3-15s, any value), so it uses v3.0 instead. Same
// provider/request shape, but ~2.4x the per-second cost in pro+audio mode
// ($0.336/s vs $0.14/s) — checked against the live AI Gateway model catalog
// (curl https://ai-gateway.vercel.sh/v1/models) before adding this.
const STUDIO_VIDEO_MODEL = "klingai/kling-v3.0-t2v";
const STUDIO_MIN_DURATION = 3;
const STUDIO_MAX_DURATION = 15;

export interface GeneratedContentVideo {
  bytes: Uint8Array;
  mediaType: string;
}

// Kling generates native audio that can say the brand name; it defaults to the
// wrong "REV-a-lor". Guide it to the correct pronunciation. Applies to every
// Revalor brand (they all contain "Revalor").
export const PRONUNCIATION =
  `If the brand name is spoken aloud, pronounce "Revalor" as "re-VAL-or" (like the word "valor" with "re" in front), never "REV-a-lor".`;

// The creative prompt for a content video, chosen by the brand's media policy
// and grounded in the real Revalor product line (products.revalorllc.com, via
// productSummaryForBrand). Video models largely ignore negative instructions
// ("never show pills"), so each template frames the subject POSITIVELY as the
// right kind of thing and then adds the hard exclusions. Exported for tests.
// Never cross-brand.
export function buildContentVideoPrompt(params: {
  brandName: string;
  brandVoiceNotes: string | null;
  hook: string | null;
  caption: string;
}): string {
  const subject = params.hook || params.caption.slice(0, 200);
  const tone = params.brandVoiceNotes ? `Brand tone: ${params.brandVoiceNotes}. ` : "";
  const brand = params.brandName;
  const { videoStyle } = brandMediaPolicy(brand);

  const products = productSummaryForBrand(brand);
  const grounding = products
    ? `The Revalor product(s) this represents (source: products.revalorllc.com) — ${products}. Depict only the actual app/experience accurately; show no other company or product, and invent nothing. `
    : "";
  const noText = `${PRONUNCIATION} Do not render any text, words, or letters in the video.`;

  let body: string;
  if (videoStyle === "kids") {
    body = `A short, wholesome, family-friendly social video for "${brand}", a mobile app made for kids and families. Bright, warm, gentle, age-appropriate footage of children and families in positive everyday moments — doing chores together, sharing how they feel, focusing calmly on an activity — matching this theme: ${subject}. ${tone}Keep it suitable for young children and their parents. This video is ONLY about ${brand}: do not show corporate offices, business dashboards, people working on laptops, or any other company, brand, or product. Nothing scary, unsafe, clinical, or adult.`;
  } else if (videoStyle === "wellness") {
    body = `A short, calming social video for "${brand}" — a mental-health and mindfulness mobile APP (a phone app, not a product you buy off a shelf). Serene, soft, modern footage: a person breathing slowly and calmly, journaling or using a phone app in a quiet peaceful moment, gentle natural light, tranquil nature, a sense of relief and steadiness — matching this theme: ${subject}. ${tone}This is a DIGITAL APP for emotional wellbeing. Do NOT show pills, capsules, tablets, powders, supplements, vitamins, bottles, medication, syringes, clinics, doctors, or any pharmaceutical, medical, or physical product of any kind. Calm and hopeful, never clinical, sad, or distressing.`;
  } else {
    body = `A short, cinematic social media video promoting "${brand}", a software app (not a physical product) - people watching need to come away understanding this is software (a mobile/web app or digital tool), not something they'd buy off a shelf. Never depict physical goods, packaging, pills, powders, bottles, or any supplement/nutrition/fitness product, regardless of what the brand name might otherwise suggest. ${tone}Visual theme: ${subject}. Style: professional, energetic, high-contrast b-roll style footage suited for an Instagram Reel or TikTok, e.g. people using a phone/laptop, UI-adjacent lifestyle shots, relevant real-world settings.`;
  }

  return `${body} ${grounding}${noText}`;
}

export async function generateContentVideo(params: {
  brandName: string;
  brandVoiceNotes: string | null;
  hook: string | null;
  caption: string;
}): Promise<GeneratedContentVideo> {
  const prompt = buildContentVideoPrompt(params);

  const result = await generateVideo({
    model: VIDEO_MODEL,
    prompt,
    aspectRatio: "9:16",
    duration: 10,
    generateAudio: true,
    providerOptions: {
      // Kling only supports native audio in pro mode — std mode rejects
      // generateAudio: true outright.
      klingai: { mode: "pro" },
    },
  });

  return { bytes: result.video.uint8Array, mediaType: result.video.mediaType };
}

// Same "this is software, not a physical product" guardrail as
// generateContentVideo's prompt above, prepended to the user's own text
// instead of a caption-derived subject — Media Studio callers write the
// video's content directly.
export async function generateStudioVideo(params: {
  prompt: string;
  durationSeconds: number;
}): Promise<GeneratedContentVideo> {
  const duration = Math.min(STUDIO_MAX_DURATION, Math.max(STUDIO_MIN_DURATION, Math.round(params.durationSeconds)));

  const prompt = `A short, cinematic social media video promoting a software app (not a physical product) - people watching need to come away understanding this is software (a mobile/web app or digital tool), not something they'd buy off a shelf. Never depict physical goods, packaging, pills, powders, bottles, or any supplement/nutrition/fitness product. ${params.prompt} ${PRONUNCIATION} Do not render any text, words, or letters in the video.`;

  const result = await generateVideo({
    model: STUDIO_VIDEO_MODEL,
    prompt,
    aspectRatio: "9:16",
    duration,
    generateAudio: true,
    providerOptions: {
      klingai: { mode: "pro" },
    },
  });

  return { bytes: result.video.uint8Array, mediaType: result.video.mediaType };
}
