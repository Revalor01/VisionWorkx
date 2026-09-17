import { experimental_generateVideo as generateVideo } from "ai";

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

export async function generateContentVideo(params: {
  brandName: string;
  brandVoiceNotes: string | null;
  hook: string | null;
  caption: string;
}): Promise<GeneratedContentVideo> {
  const subject = params.hook || params.caption.slice(0, 200);

  const prompt = `A short, cinematic social media video promoting "${params.brandName}", a software app (not a physical product) - people watching need to come away understanding this is software (a mobile/web app or digital tool), not something they'd buy off a shelf. Never depict physical goods, packaging, pills, powders, bottles, or any supplement/nutrition/fitness product, regardless of what the brand name might otherwise suggest. ${
    params.brandVoiceNotes ? `Brand tone: ${params.brandVoiceNotes}. ` : ""
  }Visual theme: ${subject}. Style: professional, energetic, high-contrast b-roll style footage suited for an Instagram Reel or TikTok, e.g. people using a phone/laptop, UI-adjacent lifestyle shots, relevant real-world settings. Do not render any text, words, or letters in the video.`;

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

  const prompt = `A short, cinematic social media video promoting a software app (not a physical product) - people watching need to come away understanding this is software (a mobile/web app or digital tool), not something they'd buy off a shelf. Never depict physical goods, packaging, pills, powders, bottles, or any supplement/nutrition/fitness product. ${params.prompt} Do not render any text, words, or letters in the video.`;

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
