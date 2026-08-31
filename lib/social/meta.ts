import crypto from "crypto";

const GRAPH_BASE = "https://graph.facebook.com/v21.0";

const META_APP_ID = process.env.META_APP_ID!;
const META_APP_SECRET = process.env.META_APP_SECRET!;

async function graphFetch(path: string, params: Record<string, string>, method: "GET" | "POST" = "GET") {
  const url = new URL(`${GRAPH_BASE}${path}`);
  if (method === "GET") {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }

  const res = await fetch(url.toString(), {
    method,
    ...(method === "POST"
      ? { headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(params) }
      : {}),
  });

  const body = await res.json();
  if (!res.ok) {
    throw new Error(`Graph API ${method} ${path} failed: ${body?.error?.message ?? JSON.stringify(body)}`);
  }
  return body;
}

// ── OAuth / token exchange ──────────────────────────────────────────────

export async function exchangeCodeForUserToken(code: string, redirectUri: string): Promise<string> {
  const body = await graphFetch("/oauth/access_token", {
    client_id: META_APP_ID,
    client_secret: META_APP_SECRET,
    redirect_uri: redirectUri,
    code,
  });
  return body.access_token;
}

export async function exchangeForLongLivedUserToken(shortLivedToken: string): Promise<string> {
  const body = await graphFetch("/oauth/access_token", {
    grant_type: "fb_exchange_token",
    client_id: META_APP_ID,
    client_secret: META_APP_SECRET,
    fb_exchange_token: shortLivedToken,
  });
  return body.access_token;
}

export interface ManagedPage {
  pageId: string;
  pageName: string;
  pageAccessToken: string; // page tokens derived from a long-lived user token don't expire
  igBusinessId: string | null;
}

// Page access tokens obtained via a long-lived user token inherit that
// long-lived-ness and don't themselves expire (Meta's documented behavior),
// so no separate page-token refresh is needed once connected.
export async function getManagedPages(userAccessToken: string): Promise<ManagedPage[]> {
  const body = await graphFetch("/me/accounts", {
    access_token: userAccessToken,
    fields: "id,name,access_token,instagram_business_account",
  });
  // Never log the raw body — it contains each Page's live access_token.
  console.log(
    "[getManagedPages] /me/accounts returned",
    (body.data ?? []).length,
    "pages; paging:",
    JSON.stringify(body.paging ?? null),
    "error:",
    JSON.stringify(body.error ?? null)
  );

  return (body.data ?? []).map((p: { id: string; name: string; access_token: string; instagram_business_account?: { id: string } }) => ({
    pageId: p.id,
    pageName: p.name,
    pageAccessToken: p.access_token,
    igBusinessId: p.instagram_business_account?.id ?? null,
  }));
}

// ── Publishing ───────────────────────────────────────────────────────────

export async function publishFacebookPost(params: {
  pageId: string;
  pageAccessToken: string;
  message: string;
}): Promise<{ postId: string }> {
  const body = await graphFetch(
    `/${params.pageId}/feed`,
    { message: params.message, access_token: params.pageAccessToken },
    "POST"
  );
  return { postId: body.id };
}

// Posts a photo directly (not just a link-unfurl preview) — the photo's
// caption is the full post text, same as a /feed post.
export async function publishFacebookPhotoPost(params: {
  pageId: string;
  pageAccessToken: string;
  imageUrl: string;
  caption: string;
}): Promise<{ postId: string }> {
  const body = await graphFetch(
    `/${params.pageId}/photos`,
    { url: params.imageUrl, caption: params.caption, access_token: params.pageAccessToken },
    "POST"
  );
  return { postId: body.post_id ?? body.id };
}

// Instagram requires a publicly fetchable media URL — pass a signed URL
// with enough TTL for Meta's servers to fetch it during container creation.
export async function publishInstagramPost(params: {
  igBusinessId: string;
  pageAccessToken: string;
  mediaUrl: string;
  isVideo: boolean;
  caption: string;
}): Promise<{ postId: string }> {
  const containerParams: Record<string, string> = {
    caption: params.caption,
    access_token: params.pageAccessToken,
  };
  containerParams[params.isVideo ? "video_url" : "image_url"] = params.mediaUrl;
  if (params.isVideo) containerParams.media_type = "REELS";

  const container = await graphFetch(`/${params.igBusinessId}/media`, containerParams, "POST");

  // Video containers process asynchronously — poll status before publishing.
  if (params.isVideo) {
    const deadline = Date.now() + 2 * 60 * 1000;
    while (Date.now() < deadline) {
      const status = await graphFetch(`/${container.id}`, {
        fields: "status_code",
        access_token: params.pageAccessToken,
      });
      if (status.status_code === "FINISHED") break;
      if (status.status_code === "ERROR") throw new Error("Instagram media container failed to process");
      await new Promise((r) => setTimeout(r, 3000));
    }
  }

  const publish = await graphFetch(
    `/${params.igBusinessId}/media_publish`,
    { creation_id: container.id, access_token: params.pageAccessToken },
    "POST"
  );
  return { postId: publish.id };
}

// ── Post-level insights ─────────────────────────────────────────────────

export interface PostMetrics {
  impressions: number | null;
  reach: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  videoViews: number | null;
  linkClicks: number | null;
  raw: Record<string, unknown>;
}

const EMPTY_METRICS: PostMetrics = {
  impressions: null,
  reach: null,
  likes: null,
  comments: null,
  shares: null,
  saves: null,
  videoViews: null,
  linkClicks: null,
  raw: {},
};

function insightMap(body: { data?: { name: string; values?: { value: unknown }[] }[] }): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of body.data ?? []) {
    const v = item.values?.[0]?.value;
    if (typeof v === "number") out[item.name] = v;
  }
  return out;
}

/** Facebook Page post: impressions/reach/clicks from insights, engagement
 *  counts from the post object. Never throws — returns nulls on failure. */
export async function getFacebookPostMetrics(
  postId: string,
  pageAccessToken: string
): Promise<PostMetrics> {
  const result: PostMetrics = { ...EMPTY_METRICS };
  try {
    const insights = await graphFetch(`/${postId}/insights`, {
      metric: "post_impressions,post_impressions_unique,post_clicks,post_video_views",
      access_token: pageAccessToken,
    });
    const m = insightMap(insights);
    result.impressions = m.post_impressions ?? null;
    result.reach = m.post_impressions_unique ?? null;
    result.linkClicks = m.post_clicks ?? null;
    result.videoViews = m.post_video_views ?? null;
    result.raw = { ...result.raw, insights: m };
  } catch (err) {
    console.error(`[getFacebookPostMetrics] insights ${postId}:`, (err as Error).message);
  }
  try {
    const obj = await graphFetch(`/${postId}`, {
      fields: "shares,reactions.summary(true),comments.summary(true)",
      access_token: pageAccessToken,
    });
    result.likes = obj?.reactions?.summary?.total_count ?? null;
    result.comments = obj?.comments?.summary?.total_count ?? null;
    result.shares = obj?.shares?.count ?? null;
    result.raw = {
      ...result.raw,
      object: { shares: obj?.shares, reactions: obj?.reactions?.summary, comments: obj?.comments?.summary },
    };
  } catch (err) {
    console.error(`[getFacebookPostMetrics] object ${postId}:`, (err as Error).message);
  }
  return result;
}

/** Instagram media insights. Tries feed metrics, falls back to reels
 *  metrics (Meta splits them and keeps changing which apply). Requires a
 *  numeric IG media id and a page token with instagram_basic +
 *  instagram_manage_insights. Never throws. */
export async function getInstagramMediaMetrics(
  mediaId: string,
  pageAccessToken: string
): Promise<PostMetrics> {
  const result: PostMetrics = { ...EMPTY_METRICS };
  const metricSets = [
    "impressions,reach,likes,comments,shares,saved",
    "reach,likes,comments,shares,saved,plays", // reels
  ];
  for (const metric of metricSets) {
    try {
      const body = await graphFetch(`/${mediaId}/insights`, { metric, access_token: pageAccessToken });
      const m = insightMap(body);
      if (Object.keys(m).length === 0) continue;
      result.impressions = m.impressions ?? result.impressions;
      result.reach = m.reach ?? result.reach;
      result.likes = m.likes ?? result.likes;
      result.comments = m.comments ?? result.comments;
      result.shares = m.shares ?? result.shares;
      result.saves = m.saved ?? result.saves;
      result.videoViews = m.plays ?? result.videoViews;
      result.raw = { ...result.raw, [metric]: m };
      return result;
    } catch (err) {
      console.error(`[getInstagramMediaMetrics] ${mediaId} (${metric}):`, (err as Error).message);
    }
  }
  return result;
}

export async function sendMessage(params: {
  pageId: string;
  pageAccessToken: string;
  recipientId: string;
  text: string;
}): Promise<void> {
  await graphFetch(
    `/${params.pageId}/messages`,
    {
      recipient: JSON.stringify({ id: params.recipientId }),
      message: JSON.stringify({ text: params.text }),
      access_token: params.pageAccessToken,
    },
    "POST"
  );
}

// ── Webhook verification ────────────────────────────────────────────────

export function verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const expected = crypto.createHmac("sha256", META_APP_SECRET).update(rawBody, "utf8").digest("hex");
  const provided = signatureHeader.slice("sha256=".length);
  if (expected.length !== provided.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
}

export function verifyWebhookChallenge(params: URLSearchParams): string | null {
  const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN;
  if (params.get("hub.mode") === "subscribe" && params.get("hub.verify_token") === verifyToken) {
    return params.get("hub.challenge");
  }
  return null;
}
