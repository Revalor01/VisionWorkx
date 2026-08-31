import crypto from "crypto";
import type { createServiceClient } from "@/lib/supabase";

type Service = ReturnType<typeof createServiceClient>;

// Where the /go/<code> redirector lives. Defaults to this app; can be
// pointed at a branded short domain later without touching callers.
export function shortLinkBase(): string {
  return (
    process.env.SHORT_LINK_BASE ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "https://vision-workx.vercel.app"
  ).replace(/\/$/, "");
}

const CODE_ALPHABET =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"; // no 0/O/1/l/I
const CODE_LEN = 7;

function randomCode(): string {
  let out = "";
  const bytes = crypto.randomBytes(CODE_LEN);
  for (let i = 0; i < CODE_LEN; i++) {
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return out;
}

export interface UtmParams {
  source: string;
  medium?: string;
  campaign?: string;
  content?: string;
}

/** Append UTM params to a URL, leaving any already-present ones untouched. */
export function withUtm(rawUrl: string, utm: UtmParams): string {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return rawUrl; // not a URL we can parse — leave it alone
  }
  const set = (k: string, v: string | undefined) => {
    if (v && !url.searchParams.has(k)) url.searchParams.set(k, v);
  };
  set("utm_source", utm.source);
  set("utm_medium", utm.medium ?? "social");
  set("utm_campaign", utm.campaign);
  set("utm_content", utm.content);
  return url.toString();
}

interface ShortLinkCtx {
  destinationUrl: string;
  socialContentId?: string | null;
  brandId?: string | null;
  platform?: string | null;
  campaign?: string | null;
}

/**
 * Returns a <base>/go/<code> URL for `destinationUrl`. Idempotent per
 * (socialContentId, destinationUrl) so a publish retry reuses the same
 * code instead of piling up rows.
 */
export async function getOrCreateShortLink(
  service: Service,
  ctx: ShortLinkCtx
): Promise<string> {
  if (ctx.socialContentId) {
    const { data: existing } = await service
      .from("short_links")
      .select("code")
      .eq("social_content_id", ctx.socialContentId)
      .eq("destination_url", ctx.destinationUrl)
      .maybeSingle();
    if (existing) return `${shortLinkBase()}/go/${existing.code}`;
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode();
    const { error } = await service.from("short_links").insert({
      code,
      destination_url: ctx.destinationUrl,
      social_content_id: ctx.socialContentId ?? null,
      brand_id: ctx.brandId ?? null,
      platform: ctx.platform ?? null,
      campaign: ctx.campaign ?? null,
    });
    if (!error) return `${shortLinkBase()}/go/${code}`;
    // 23505 = unique_violation on `code`; retry with a fresh code.
    if (error.code !== "23505") throw new Error(`short link insert failed: ${error.message}`);
  }
  throw new Error("could not allocate a unique short-link code after 5 attempts");
}
