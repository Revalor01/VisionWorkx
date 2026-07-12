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
