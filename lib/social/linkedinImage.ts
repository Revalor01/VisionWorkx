// LinkedIn post images: stored in the private social-content-images bucket
// (shared with social_content images, see migration 26) under
// linkedin/<post id>/. Only reachable through service-role signed URLs.

export const LINKEDIN_IMAGE_BUCKET = "social-content-images";
export const LINKEDIN_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

// LinkedIn accepts JPG/PNG for company-page images (the bucket also allows
// webp, which LinkedIn doesn't take, so it's left out here).
export const LINKEDIN_IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
};

export function linkedinImagePrefix(postId: string): string {
  return `linkedin/${postId}/`;
}

/** A stored path is only accepted for a post if it sits in that post's folder. */
export function isLinkedinImagePath(postId: string, path: string): boolean {
  const prefix = linkedinImagePrefix(postId);
  if (!path.startsWith(prefix)) return false;
  const rest = path.slice(prefix.length);
  return /^[A-Za-z0-9-]+\.(jpg|png)$/.test(rest);
}
