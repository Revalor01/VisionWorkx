import crypto from "crypto";

const API_BASE = "https://open.tiktokapis.com/v2";
const AUTHORIZE_URL = "https://www.tiktok.com/v2/auth/authorize/";

const CLIENT_KEY = process.env.TIKTOK_CLIENT_KEY!;
const CLIENT_SECRET = process.env.TIKTOK_CLIENT_SECRET!;

// ── PKCE ─────────────────────────────────────────────────────────────────
// TikTok's docs say PKCE is required for desktop/mobile and optional for
// web (state-param CSRF protection covers web), but it's harmless to
// include unconditionally, so this always generates one.

export function generatePkcePair(): { verifier: string; challenge: string } {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function buildAuthorizeUrl(params: { redirectUri: string; state: string; codeChallenge: string }): string {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("client_key", CLIENT_KEY);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("state", params.state);
  url.searchParams.set("response_type", "code");
  // video.publish: required for the Content Posting API direct-post flow.
  // user.info.basic: lets us show which TikTok account is connected.
  url.searchParams.set("scope", "user.info.basic,video.publish");
  url.searchParams.set("code_challenge", params.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

interface TikTokTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number; // seconds
  open_id: string;
  error?: string;
  error_description?: string;
}

async function tokenRequest(body: Record<string, string>): Promise<TikTokTokenResponse> {
  const res = await fetch(`${API_BASE}/oauth/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams(body),
  });
  const json = (await res.json()) as TikTokTokenResponse;
  if (!res.ok || json.error) {
    throw new Error(`TikTok token request failed: ${json.error_description ?? json.error ?? `HTTP ${res.status}`}`);
  }
  return json;
}

export async function exchangeCodeForTikTokToken(params: {
  code: string;
  redirectUri: string;
  codeVerifier: string;
}): Promise<TikTokTokenResponse> {
  return tokenRequest({
    client_key: CLIENT_KEY,
    client_secret: CLIENT_SECRET,
    code: params.code,
    grant_type: "authorization_code",
    redirect_uri: params.redirectUri,
    code_verifier: params.codeVerifier,
  });
}

export async function refreshTikTokToken(refreshToken: string): Promise<TikTokTokenResponse> {
  return tokenRequest({
    client_key: CLIENT_KEY,
    client_secret: CLIENT_SECRET,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
}

export async function getTikTokUserInfo(accessToken: string): Promise<{ openId: string; username: string | null }> {
  const res = await fetch(`${API_BASE}/user/info/?fields=open_id,display_name`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body = await res.json();
  if (!res.ok || body.error?.code !== "ok") {
    throw new Error(`TikTok user info request failed: ${body.error?.message ?? `HTTP ${res.status}`}`);
  }
  return { openId: body.data.user.open_id, username: body.data.user.display_name ?? null };
}

// TikTok requires querying the creator's available privacy/interaction
// options before every post — using an option not in their list fails
// the request. During the pre-audit period every account is effectively
// limited to SELF_ONLY regardless of what this returns.
export async function queryCreatorInfo(accessToken: string): Promise<{ privacyLevelOptions: string[] }> {
  const res = await fetch(`${API_BASE}/post/publish/creator_info/query/`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json; charset=UTF-8" },
  });
  const body = await res.json();
  if (!res.ok || body.error?.code !== "ok") {
    throw new Error(`TikTok creator info query failed: ${body.error?.message ?? `HTTP ${res.status}`}`);
  }
  return { privacyLevelOptions: body.data.privacy_level_options ?? [] };
}

// Publishes straight to the connected creator's profile via PULL_FROM_URL
// (TikTok's servers fetch the video themselves) — mirrors how Instagram
// publishing already works with a signed Supabase Storage URL. Until this
// app passes TikTok's Content Posting API audit, every post is forced
// SELF_ONLY (private, visible only to the creator) regardless of the
// privacy_level requested — see the standing note in the cron route.
export async function publishTikTokVideo(params: {
  accessToken: string;
  videoUrl: string;
  caption: string;
}): Promise<{ publishId: string }> {
  const { privacyLevelOptions } = await queryCreatorInfo(params.accessToken);
  const privacyLevel = privacyLevelOptions.includes("SELF_ONLY") ? "SELF_ONLY" : (privacyLevelOptions[0] ?? "SELF_ONLY");

  const res = await fetch(`${API_BASE}/post/publish/video/init/`, {
    method: "POST",
    headers: { Authorization: `Bearer ${params.accessToken}`, "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify({
      post_info: {
        title: params.caption.slice(0, 90),
        privacy_level: privacyLevel,
      },
      source_info: {
        source: "PULL_FROM_URL",
        video_url: params.videoUrl,
      },
    }),
  });
  const body = await res.json();
  if (!res.ok || body.error?.code !== "ok") {
    throw new Error(`TikTok video publish failed: ${body.error?.message ?? `HTTP ${res.status}`}`);
  }
  return { publishId: body.data.publish_id };
}
