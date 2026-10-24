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

// A paused brand's autonomy (social_brands.autonomy_paused_at — set by a flag
// or by hand on /admin/social) also stops its automatic posts that were
// already scheduled: everything saved as generated_by "autonomous" (the
// autopilot's, the batch generator's and Renaissance's). Hand-written and
// Content-engine posts still go out. An automatic post more than
// STALE_AFTER_HOURS past its time is "stale" — e.g. it was held while the brand
// was paused — and goes back to a draft instead of publishing late (so a
// resumed brand doesn't post a backlog of old posts at once).
export const STALE_AFTER_HOURS = 6;

export function holdPaused<T extends { brand_id: string; generated_by: string | null; scheduled_at: string | null }>(due: T[], isPaused: (brandId: string) => boolean, now: Date = new Date()): { go: T[]; held: T[]; stale: T[] } {
  const go: T[] = [];
  const held: T[] = [];
  const stale: T[] = [];
  const cutoff = now.getTime() - STALE_AFTER_HOURS * 3_600_000;
  for (const post of due) {
    const auto = post.generated_by === "autonomous";
    if (auto && post.scheduled_at && new Date(post.scheduled_at).getTime() < cutoff) stale.push(post);
    else if (auto && isPaused(post.brand_id)) held.push(post);
    else go.push(post);
  }
  return { go, held, stale };
}
