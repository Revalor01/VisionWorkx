import { experimental_generateVideo as generateVideo } from "ai";

// Routed through Vercel AI Gateway. Kling v2.6 — well-documented, far
// cheaper than Veo/Runway/Sora, good fit for a short weekly clip.
const VIDEO_MODEL = "klingai/kling-v2.6-t2v";

export interface GeneratedRecapVideo {
  bytes: Uint8Array;
  mediaType: string;
}

export async function generateRecapVideo(videoPrompt: string): Promise<GeneratedRecapVideo> {
  const result = await generateVideo({
    model: VIDEO_MODEL,
    prompt: videoPrompt,
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
