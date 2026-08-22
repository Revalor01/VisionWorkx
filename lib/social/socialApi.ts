// SocialAPI.ai client — replaces the Instagram half of lib/social/meta.ts
// and the direct TikTok integration in lib/social/tiktok.ts, and adds
// YouTube. SocialAPI.ai carries its own pre-approved Meta/TikTok/Google
// apps, so connecting a brand's account is a simple OAuth redirect instead
// of Revalor needing its own Meta App Review, TikTok Content Posting API
// audit, or Google Cloud project. Facebook stays on its existing direct
// integration (lib/social/meta.ts) — this file covers what that can't.

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
export async function getInstagramConnectUrl(redirectUri: string, state: string): Promise<string> {
  const body = await apiFetch("/accounts/connect", {
    method: "POST",
    body: JSON.stringify({ platform: "instagram", redirect_uri: redirectUri, state }),
  });
  return body.auth_url;
}

export async function getTikTokConnectUrl(redirectUri: string, state: string): Promise<string> {
  const body = await apiFetch("/accounts/connect", {
    method: "POST",
    body: JSON.stringify({ platform: "tiktok", redirect_uri: redirectUri, state }),
  });
  return body.auth_url;
}

export async function getYouTubeConnectUrl(redirectUri: string, state: string): Promise<string> {
  const body = await apiFetch("/accounts/connect", {
    method: "POST",
    body: JSON.stringify({ platform: "youtube", redirect_uri: redirectUri, state }),
  });
  return body.auth_url;
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

export async function publishTikTokPost(params: {
  accountId: string;
  mediaUrl: string;
  caption: string;
}): Promise<{ postId: string }> {
  const created = await apiFetch("/posts", {
    method: "POST",
    body: JSON.stringify({
      text: params.caption,
      media: [{ source: params.mediaUrl, source_type: "url", type: "video" }],
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
