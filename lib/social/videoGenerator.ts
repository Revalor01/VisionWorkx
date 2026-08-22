import { experimental_generateVideo as generateVideo } from "ai";

// Same model/gateway as recapVideoGenerator.ts — Kling v2.6, routed through
// Vercel AI Gateway. Real cost: ~$0.84/video at 10s/9:16/pro-with-audio
// (checked via the existing spend dashboard before adding this).
const VIDEO_MODEL = "klingai/kling-v2.6-t2v";

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

  const prompt = `A short, cinematic social media video promoting "${params.brandName}", a software product. ${
    params.brandVoiceNotes ? `Brand tone: ${params.brandVoiceNotes}. ` : ""
  }Visual theme: ${subject}. Style: professional, energetic, high-contrast b-roll style footage suited for an Instagram Reel or TikTok. Do not render any text, words, or letters in the video.`;

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
