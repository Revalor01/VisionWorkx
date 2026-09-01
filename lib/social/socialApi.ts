// SocialAPI.ai client — replaces the Instagram half of lib/social/meta.ts
// and the direct TikTok integration in lib/social/tiktok.ts, and adds
// YouTube. SocialAPI.ai carries its own pre-approved Meta/TikTok/Google
// apps, so connecting a brand's account is a simple OAuth redirect instead
// of Revalor needing its own Meta App Review, TikTok Content Posting API
// audit, or Google Cloud project. Facebook stays on its existing direct
// integration (lib/social/meta.ts) — this file covers what that can't.
// Also covers the SocialAPI inbox (DMs/comments) — see the webhook
// signature/reply functions near the bottom of this file.

import crypto from "crypto";

const API_BASE = "https://api.social-api.ai/v1";
const SOCIALAPI_KEY = process.env.SOCIALAPI_API_KEY!;

async function apiFetch(path: string, init: RequestInit = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${SOCIALAPI_KEY}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });

  const body = await res.json();
  if (!res.ok) {
    throw new Error(`SocialAPI ${init.method ?? "GET"} ${path} failed: ${JSON.stringify(body)}`);
  }
  return body;
}

// ── Account connection (one-time per brand) ─────────────────────────────

// `state` carries the brand id through the redirect round-trip so the
// callback route knows which social_brands row to save the account_id to.
// `brandId` is SocialAPI's *own* brand id (social_brands.socialapi_brand_id),
// not ours — omitting it makes SocialAPI silently auto-create a brand-new
// brand on every connect, which is what was burning through the plan's
// brand cap. Always resolve one via ensureSocialApiBrandId() first.
export async function getInstagramConnectUrl(redirectUri: string, state: string, brandId: string): Promise<string> {
  const body = await apiFetch("/accounts/connect", {
    method: "POST",
    body: JSON.stringify({ platform: "instagram", redirect_uri: redirectUri, state, brand_id: brandId }),
  });
  return body.auth_url;
}

export async function getTikTokConnectUrl(redirectUri: string, state: string, brandId: string): Promise<string> {
  const body = await apiFetch("/accounts/connect", {
    method: "POST",
    body: JSON.stringify({ platform: "tiktok", redirect_uri: redirectUri, state, brand_id: brandId }),
  });
  return body.auth_url;
}

export async function getYouTubeConnectUrl(redirectUri: string, state: string, brandId: string): Promise<string> {
  const body = await apiFetch("/accounts/connect", {
    method: "POST",
    body: JSON.stringify({ platform: "youtube", redirect_uri: redirectUri, state, brand_id: brandId }),
  });
  return body.auth_url;
}

// Facebook here is inbox-only — Facebook posting stays on the existing
// direct Meta integration (lib/social/meta.ts, fb_page_id), which already
// works. This connects the same Page a second time, through SocialAPI,
// purely so its DMs/comments reach the SocialAPI webhook.
export async function getFacebookInboxConnectUrl(redirectUri: string, state: string, brandId: string): Promise<string> {
  const body = await apiFetch("/accounts/connect", {
    method: "POST",
    body: JSON.stringify({ platform: "facebook", redirect_uri: redirectUri, state, brand_id: brandId }),
  });
  return body.auth_url;
}

// ── Brand management ─────────────────────────────────────────────────────
// A SocialAPI "brand" is their own concept, separate from our social_brands
// table — social_brands.socialapi_brand_id caches the mapping so a given
// Revalor brand always reuses the same SocialAPI brand across connects.

export interface SocialApiBrand {
  id: string;
  name: string;
  accountsCount: number;
}

export async function listSocialApiBrands(): Promise<SocialApiBrand[]> {
  const body = await apiFetch("/brands");
  return (body.data ?? []).map((b: { id: string; name: string; accounts_count?: number }) => ({
    id: b.id,
    name: b.name,
    accountsCount: b.accounts_count ?? 0,
  }));
}

export async function createSocialApiBrand(name: string): Promise<string> {
  const body = await apiFetch("/brands", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  return body.id;
}

// Resolves the SocialAPI brand id for a given local brand, creating one
// (or reusing a same-named existing one, e.g. from before this mapping
// existed) if it hasn't been cached yet.
export async function ensureSocialApiBrandId(brandName: string, cachedBrandId: string | null): Promise<string> {
  if (cachedBrandId) return cachedBrandId;
  const existing = await listSocialApiBrands();
  const match = existing.find((b) => b.name.toLowerCase() === brandName.toLowerCase());
  if (match) return match.id;
  return createSocialApiBrand(brandName);
}

// ── Account lookup (for the admin UI to show which real account is connected) ──

export interface SocialApiAccount {
  id: string;
  platform: string;
  username: string | null;
  profilePictureUrl: string | null;
}

// SocialAPI has no GET /accounts/{id} (405s) — only a flat list. Fine at
// Revalor's current scale (a handful of connected accounts).
export async function listSocialApiAccounts(): Promise<SocialApiAccount[]> {
  const body = await apiFetch("/accounts");
  return (body.data ?? []).map((a: { id: string; platform: string; username?: string; profile_picture_url?: string }) => ({
    id: a.id,
    platform: a.platform,
    username: a.username ?? null,
    profilePictureUrl: a.profile_picture_url ?? null,
  }));
}

// ── Publishing ───────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 3000;
const POLL_MAX_ATTEMPTS = 20; // ~60s — Meta/TikTok process media asynchronously after we submit it

// Shared by Instagram and TikTok publishing — both platforms return
// "publishing"/"pending" from the creation call and finish processing the
// media afterward, so success has to be judged from a later poll, not the
// immediate response.
async function pollPostUntilTerminal(
  postId: string,
  initial: { targets?: { status: string; platform_post_id?: string; permalink?: string }[]; status?: string },
  platformLabel: string
): Promise<{ status: string; platform_post_id?: string; permalink?: string }> {
  let body = initial;
  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
    const target = body.targets?.[0];
    if (target?.status === "published") return target;
    if (target?.status === "failed" || body.status === "failed") {
      throw new Error(`SocialAPI ${platformLabel} publish failed: ${JSON.stringify(body)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    body = await apiFetch(`/posts/${postId}`);
  }
  throw new Error(`SocialAPI ${platformLabel} publish did not reach a terminal state in time: ${JSON.stringify(body)}`);
}

export async function publishInstagramPost(params: {
  accountId: string;
  mediaUrl: string;
  isVideo: boolean;
  caption: string;
}): Promise<{ postId: string; permalink: string | null }> {
  const created = await apiFetch("/posts", {
    method: "POST",
    body: JSON.stringify({
      text: params.caption,
      media: [{ source: params.mediaUrl, source_type: "url", type: params.isVideo ? "video" : "image" }],
      targets: [{ account_id: params.accountId }],
      publish_now: true,
      // Required by SocialAPI for Instagram — "feed" covers a plain
      // single image/video post; reels/stories/carousel aren't used here.
      platform_data: { instagram: { content_type: params.isVideo ? "reel" : "feed" } },
    }),
  });

  const target = await pollPostUntilTerminal(created.id, created, "Instagram");
  return { postId: target.platform_post_id!, permalink: target.permalink ?? null };
}

// TikTok's Content Posting API requires PULL_FROM_URL sources to come from
// a domain verified with whichever TikTok app is making the call - our own
// Supabase Storage URLs aren't verified with SocialAPI's TikTok app, so
// they fail with "platform.tiktok.url_ownership_unverified". SocialAPI's
// docs (docs.social-api.ai/posts/tiktok) require going through their own
// media library instead: upload the file, then reference it by media_id.
export async function uploadMediaForTikTok(params: { bytes: Blob; filename: string; mediaType: string }): Promise<string> {
  const { media_id, upload_url } = await apiFetch(
    `/media/upload-url?media_type=${encodeURIComponent(params.mediaType)}&filename=${encodeURIComponent(params.filename)}`
  );

  const putRes = await fetch(upload_url, {
    method: "PUT",
    headers: { "Content-Type": params.mediaType },
    body: params.bytes,
  });
  if (!putRes.ok) throw new Error(`SocialAPI media upload PUT failed: HTTP ${putRes.status}`);

  await apiFetch(`/media/${media_id}/verify`, { method: "POST" });
  return media_id;
}

export async function publishTikTokPost(params: {
  accountId: string;
  mediaId: string;
  caption: string;
}): Promise<{ postId: string }> {
  const created = await apiFetch("/posts", {
    method: "POST",
    body: JSON.stringify({
      text: params.caption,
      media: [{ source: params.mediaId, source_type: "media_id", type: "video" }],
      targets: [{ account_id: params.accountId }],
      publish_now: true,
      platform_data: {
        tiktok: {
          // TikTok's Direct Post guidelines prohibit a client-applied
          // default privacy level, but SocialAPI requires the field
          // regardless — PUBLIC_TO_EVERYONE is the intended real-world
          // behavior for scheduled brand content. Worth confirming this
          // value is actually accepted once a real account is connected
          // (accepted values are account-specific per SocialAPI's docs).
          privacy_level: "PUBLIC_TO_EVERYONE",
          disable_comment: false,
          disable_duet: false,
          disable_stitch: false,
        },
      },
    }),
  });

  // TikTok's SocialAPI response never includes a permalink (unlike
  // Instagram) — only the platform post id.
  const target = await pollPostUntilTerminal(created.id, created, "TikTok");
  return { postId: target.platform_post_id! };
}

export async function publishYouTubePost(params: {
  accountId: string;
  mediaUrl: string;
  title: string;
  description: string;
}): Promise<{ postId: string; permalink: string | null }> {
  const created = await apiFetch("/posts", {
    method: "POST",
    body: JSON.stringify({
      // YouTube is the one platform where title is a distinct top-level
      // field from the post body — capped at 100 chars by YouTube itself.
      title: params.title.slice(0, 100),
      text: params.description,
      visibility: "public",
      media: [{ source: params.mediaUrl, source_type: "url", type: "video" }],
      targets: [{ account_id: params.accountId }],
      publish_now: true,
    }),
  });

  const target = await pollPostUntilTerminal(created.id, created, "YouTube");
  return { postId: target.platform_post_id!, permalink: target.permalink ?? null };
}

// ── Inbox / DM webhook (app/api/webhooks/socialapi) ─────────────────────

// SocialAPI signs webhook deliveries as sha256=<hmac-hex> of the raw body,
// using the per-endpoint secret returned once at webhook creation time.
// Constant-time comparison — a plain string check leaks timing info.
export function verifySocialApiWebhookSignature(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  if (!signatureHeader) return false;
  const expected = `sha256=${crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex")}`;
  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(signatureHeader);
  if (expectedBuf.length !== actualBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}

// The dm.received webhook payload carries a message id and the sender's
// platform id, not a conversation id — resolving the conversation is a
// separate lookup, needed before a reply can be sent.
export async function findConversationId(accountId: string, participantId: string): Promise<string | null> {
  const body = await apiFetch(`/inbox/conversations?account_id=${encodeURIComponent(accountId)}&participant_id=${encodeURIComponent(participantId)}`);
  return body.data?.[0]?.id ?? null;
}

export async function sendInboxReply(conversationId: string, accountId: string, text: string): Promise<{ messageId: string }> {
  const body = await apiFetch(`/inbox/conversations/${conversationId}/messages`, {
    method: "POST",
    body: JSON.stringify({ account_id: accountId, text }),
  });
  return { messageId: body.message_id };
}
