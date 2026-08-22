// SocialAPI.ai client — replaces the Instagram half of lib/social/meta.ts.
// SocialAPI.ai carries its own pre-approved Meta app, so connecting a brand's
// Instagram account is a simple OAuth redirect instead of Revalor needing
// its own Meta App Review. Facebook/TikTok stay on their existing direct
// integrations (lib/social/meta.ts, lib/social/tiktok.ts) — this file only
// covers what those can't: Instagram without App Review.

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

// ── Publishing ───────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 3000;
const POLL_MAX_ATTEMPTS = 20; // ~60s — Meta processes the media asynchronously after we submit it

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

  // The creation call returns before Meta finishes processing the media —
  // status starts as "publishing"/"pending", not "published". Poll the post
  // until it reaches a terminal state instead of judging off this response.
  let body = created;
  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
    const target = body.targets?.[0];
    if (target?.status === "published") {
      return { postId: target.platform_post_id, permalink: target.permalink ?? null };
    }
    if (target?.status === "failed" || body.status === "failed") {
      throw new Error(`SocialAPI Instagram publish failed: ${JSON.stringify(body)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    body = await apiFetch(`/posts/${created.id}`);
  }

  throw new Error(`SocialAPI Instagram publish did not reach a terminal state in time: ${JSON.stringify(body)}`);
}
