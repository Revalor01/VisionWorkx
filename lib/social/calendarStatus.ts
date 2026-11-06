// What the Social calendar shows for a post's status. A post that has a publish
// time and is only waiting on its automatic media — "approved" (Renaissance or a
// weekly image brand, released once the image/video exists) or a timed draft
// with an image or video on the way (batch hero posts) — shows as scheduled.
// Plain drafts (held for review, no time) stay drafts. Pure.
export function calendarStatus(post: { status: string; scheduled_at: string | null; auto_image?: boolean | null; video_asset_id?: string | null }): string {
  if (!post.scheduled_at) return post.status;
  if (post.status === "approved") return "scheduled";
  if (post.status === "draft" && (post.auto_image || post.video_asset_id)) return "scheduled";
  return post.status;
}
