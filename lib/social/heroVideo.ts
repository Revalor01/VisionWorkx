// Hero videos are queued as a social_video_assets row (status "generating", this
// note) and rendered one per run by the social-video-worker cron, which then
// releases the linked post. Shared by the batch generator and Renaissance.
export const BATCH_HERO_NOTE = "Batch hero video (queued)";

/**
 * Whether a Renaissance post gets a hero video: only when asked, only on Facebook
 * (Instagram posts carry an automatic image instead), never for a kids brand
 * (image-first, ~1 video/week policy), and only when it's going out on its own. Pure.
 */
export function renaissanceWantsVideo(req: { heroVideo: boolean; platform: string }, audience: string, scheduled: boolean): boolean {
  return scheduled && req.heroVideo && req.platform === "facebook" && audience !== "kids";
}

/**
 * What the worker does to the linked post once its video is done. Batch posts wait
 * as drafts; Renaissance posts wait as "approved" (so a Renaissance pull-back, which
 * turns them into drafts with no time, can never be released by a finished render).
 * On failure a waiting Renaissance post still goes out, just without the video. Pure.
 */
export function heroVideoRelease(post: { status: string; scheduled_at: string | null } | null, outcome: "ready" | "failed"):
  { status: "scheduled"; dropVideo: boolean; from: "draft" | "approved" } | null {
  if (!post) return null;
  if (post.status === "approved" && post.scheduled_at) return { status: "scheduled", dropVideo: outcome === "failed", from: "approved" };
  // Batch drafts always carry their slot; a Renaissance post pulled back mid-render is a draft with NO time — leave it.
  if (post.status === "draft" && post.scheduled_at && outcome === "ready") return { status: "scheduled", dropVideo: false, from: "draft" };
  return null;
}
