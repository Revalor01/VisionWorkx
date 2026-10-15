// Facebook rejects a second post to the same Page made seconds after the first
// (2026-10-15: Revalor LLC and Revalor Kids share the "Revalor" Page; both
// were due at 10:00 ET, LLC's photo went out and Kids' failed with Graph's
// "An unknown error occurred"). So each social-publish run sends at most ONE
// Facebook post per Page — the oldest due — and leaves the rest scheduled for
// the next run (every 10 minutes). Other platforms are unaffected.

type Due = { id: string; platform: string; brand_id: string; scheduled_at: string | null };

export function pickPublishable<T extends Due>(due: T[], fbPageOf: (brandId: string) => string | null | undefined): { now: T[]; deferred: T[] } {
  const sorted = [...due].sort((a, b) => (a.scheduled_at ?? "").localeCompare(b.scheduled_at ?? ""));
  const usedPages = new Set<string>();
  const now: T[] = [];
  const deferred: T[] = [];
  for (const post of sorted) {
    const page = post.platform === "facebook" ? fbPageOf(post.brand_id) : null;
    if (page && usedPages.has(page)) {
      deferred.push(post);
      continue;
    }
    if (page) usedPages.add(page);
    now.push(post);
  }
  return { now, deferred };
}
