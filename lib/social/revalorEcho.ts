import type { createServiceClient } from "@/lib/supabase";
import type { SocialContent } from "@/lib/database.types";
import { isKidsBrand } from "@/lib/social/brandMediaPolicy";

// Revalor page copies (owner, 2026-11-07): the Revalor (Revalor LLC) Facebook Page
// is the umbrella for every product except Revalor Kids. When a product brand's
// Facebook post goes out, a copy (same text, image or video, product link) is
// scheduled on the Revalor Page about a day later — never the same moment, so people
// who follow both don't see it twice in a row — and at most one copy a day.
// Copies still pass every check in publishPost (product rule included) when they go.

export const REVALOR_PAGE_BRAND = "Revalor LLC";
export const ECHO_DELAY_HOURS = 24;
/** Look this many days ahead for a free day; if all are taken, skip the copy. */
export const ECHO_MAX_DAYS = 7;
const HOUR = 3_600_000;
const dayKey = (d: Date) => d.toISOString().slice(0, 10);

/** Should this just-published post get a Revalor Page copy? Pure. */
export function shouldEcho(post: Pick<SocialContent, "platform" | "echo_of">, brandName: string): boolean {
  return post.platform === "facebook" && !post.echo_of && brandName !== REVALOR_PAGE_BRAND && !isKidsBrand(brandName);
}

/**
 * When the copy goes: ECHO_DELAY_HOURS after the original, moved to the next day
 * with no copy yet (same time of day). null when the next ECHO_MAX_DAYS are full. Pure.
 */
export function echoSlot(postedAt: Date, takenDays: Set<string>): string | null {
  const first = new Date(postedAt.getTime() + ECHO_DELAY_HOURS * HOUR);
  first.setUTCSeconds(0, 0);
  for (let i = 0; i < ECHO_MAX_DAYS; i++) {
    const t = new Date(first.getTime() + i * 24 * HOUR);
    if (!takenDays.has(dayKey(t))) return t.toISOString();
  }
  return null;
}

type Service = ReturnType<typeof createServiceClient>;

/**
 * Schedules the Revalor Page copy of a post that just published. Never throws — a
 * failed copy must not turn a successful publish into a failure.
 */
export async function scheduleRevalorEcho(
  service: Service,
  post: SocialContent,
  brandName: string,
  sent: { caption: string; hook: string | null; link: string },
): Promise<void> {
  try {
    if (!shouldEcho(post, brandName)) return;
    const { data: revalor } = await service.from("social_brands").select("id, fb_page_id").eq("name", REVALOR_PAGE_BRAND).maybeSingle();
    if (!revalor?.fb_page_id) return;

    const now = new Date();
    const { data: copies, error } = await service
      .from("social_content")
      .select("scheduled_at, posted_at")
      .eq("brand_id", revalor.id)
      .not("echo_of", "is", null)
      .in("status", ["scheduled", "approved", "posted"])
      .gte("scheduled_at", new Date(now.getTime() - 2 * 24 * HOUR).toISOString());
    if (error) throw error;
    const taken = new Set((copies ?? []).map((c) => dayKey(new Date((c.posted_at ?? c.scheduled_at)!))));
    const slot = echoSlot(now, taken);
    if (!slot) return;

    const { error: insertError } = await service.from("social_content").insert({
      brand_id: revalor.id,
      platform: "facebook",
      hook: sent.hook,
      caption: sent.caption,
      hashtags: post.hashtags,
      image_path: post.image_path,
      video_asset_id: post.video_asset_id,
      link_url: sent.link,
      status: "scheduled",
      scheduled_at: slot,
      risk_level: post.risk_level,
      generated_by: post.generated_by,
      echo_of: post.id,
    });
    // 23505 = this original already has its copy.
    if (insertError && insertError.code !== "23505") throw insertError;
  } catch (err) {
    console.error(`[revalorEcho] copy of ${post.id} not scheduled:`, (err as Error).message);
  }
}
