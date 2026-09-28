import { modulesServiceClient } from "./supabase";
import { decryptToken, encryptToken } from "./tokenCrypto";
import { submissionEmail } from "./submissionEmail";
import type { Busy } from "./booking";

// Google Calendar sync for booking modules (A7-B). One connected calendar
// (the owner's primary) per workspace, stored in vw_calendar_connections:
//   - its busy times block booking slots (freebusy — times only, no details)
//   - confirmed bookings are written to it as events, moved on reschedule and
//     removed on cancel (vw_bookings.gcal_event_id links the two).
// Scopes are deliberately narrow (see GOOGLE_SCOPES) to stay "sensitive"
// rather than "restricted" in Google's OAuth verification.
//
// Failure policy: Google being down or the owner revoking access must never
// break booking. Busy lookups fail open (VisionWorkx bookings still block),
// event writes are best-effort and logged. A revoked grant flips the
// connection to status 'error' so the Settings card can ask for a reconnect.
//
// Plain fetch against Google's REST endpoints — no googleapis dependency.

export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.events.owned",
  "https://www.googleapis.com/auth/calendar.freebusy",
] as const;
const REQUIRED_SCOPES = GOOGLE_SCOPES.filter((s) => s.startsWith("https://"));

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const CAL_API = "https://www.googleapis.com/calendar/v3";

export const CALLBACK_PATH = "/api/calendar/google/callback";
/** Browser-binding nonce for the OAuth round trip (see the connect route). */
export const STATE_COOKIE = "vw_gcal_nonce";
export const STATE_TTL_S = 600;

export function googleCalendarConfigured(): boolean {
  return !!(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET && process.env.CALENDAR_TOKEN_KEY);
}

// ── OAuth ────────────────────────────────────────────────────────────────────

export function authUrl(input: { redirectUri: string; state: string; loginHint?: string | null }): string {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
    redirect_uri: input.redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent", // always returns a refresh token, even on reconnect
    state: input.state,
  });
  if (input.loginHint) p.set("login_hint", input.loginHint);
  return `${AUTH_URL}?${p}`;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  id_token?: string;
  error?: string;
}

export type ExchangeResult =
  | { ok: true; refreshToken: string; accessToken: string; expiresIn: number; email: string | null }
  | { ok: false; reason: "missing_scopes" | "no_refresh_token" | "error" };

export async function exchangeCode(code: string, redirectUri: string): Promise<ExchangeResult> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  }).catch(() => null);
  if (!res?.ok) {
    console.error("[gcal] code exchange failed:", res?.status);
    return { ok: false, reason: "error" };
  }
  const t = (await res.json()) as TokenResponse;
  // Google's consent screen lets people untick individual permissions.
  if (!hasScopes(t.scope ?? "")) {
    await revoke(t.access_token);
    return { ok: false, reason: "missing_scopes" };
  }
  if (!t.refresh_token) return { ok: false, reason: "no_refresh_token" };
  return { ok: true, refreshToken: t.refresh_token, accessToken: t.access_token, expiresIn: t.expires_in, email: emailFromIdToken(t.id_token) };
}

export function hasScopes(granted: string): boolean {
  const set = new Set(granted.split(/\s+/));
  return REQUIRED_SCOPES.every((s) => set.has(s));
}

/**
 * The account email from an id_token. It came straight from Google's token
 * endpoint over TLS in exchange for our client secret, so the payload is
 * trusted without re-verifying the signature; it's only used for display.
 */
export function emailFromIdToken(idToken: string | undefined): string | null {
  const payload = idToken?.split(".")[1];
  if (!payload) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { email?: unknown };
    return typeof claims.email === "string" ? claims.email.slice(0, 254) : null;
  } catch {
    return null;
  }
}

async function revoke(token: string): Promise<void> {
  await fetch(`${REVOKE_URL}?token=${encodeURIComponent(token)}`, { method: "POST" }).catch(() => null);
}

// ── connections ──────────────────────────────────────────────────────────────

export interface CalendarConnectionStatus {
  status: "none" | "active" | "error";
  accountEmail: string | null;
  lastError: string | null;
}

interface ConnectionRow {
  workspace_id: string;
  account_email: string | null;
  calendar_id: string;
  refresh_token_enc: string | null;
  status: "active" | "error" | "disconnected";
}

/** For the Settings card — never returns the token. */
export async function connectionStatus(workspaceId: string): Promise<CalendarConnectionStatus> {
  const { data } = await modulesServiceClient()
    .from("vw_calendar_connections")
    .select("status, account_email, last_error")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!data || data.status === "disconnected") return { status: "none", accountEmail: null, lastError: null };
  return { status: data.status, accountEmail: data.account_email, lastError: data.last_error };
}

export async function saveConnection(input: { workspaceId: string; userId: string; email: string | null; refreshToken: string }) {
  const { error } = await modulesServiceClient()
    .from("vw_calendar_connections")
    .upsert(
      {
        workspace_id: input.workspaceId,
        provider: "google",
        account_email: input.email,
        calendar_id: "primary",
        refresh_token_enc: encryptToken(input.refreshToken),
        status: "active",
        last_error: null,
        connected_by: input.userId,
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "workspace_id" },
    );
  tokenCache.delete(input.workspaceId);
  busyCache.clear();
  return !error;
}

/** Revokes the grant at Google (best effort) and clears the stored token. */
export async function disconnect(workspaceId: string): Promise<void> {
  const db = modulesServiceClient();
  const { data } = await db.from("vw_calendar_connections").select("refresh_token_enc").eq("workspace_id", workspaceId).maybeSingle();
  if (data?.refresh_token_enc) {
    try {
      await revoke(decryptToken(data.refresh_token_enc));
    } catch (err) {
      console.error("[gcal] revoke failed:", err);
    }
  }
  await db
    .from("vw_calendar_connections")
    .update({ status: "disconnected", refresh_token_enc: null, account_email: null, last_error: null, updated_at: new Date().toISOString() })
    .eq("workspace_id", workspaceId);
  tokenCache.delete(workspaceId);
  busyCache.clear();
}

async function activeConnection(workspaceId: string): Promise<ConnectionRow | null> {
  const { data } = await modulesServiceClient()
    .from("vw_calendar_connections")
    .select("workspace_id, account_email, calendar_id, refresh_token_enc, status")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  return data?.status === "active" && data.refresh_token_enc ? (data as ConnectionRow) : null;
}

async function markError(workspaceId: string, message: string) {
  await modulesServiceClient()
    .from("vw_calendar_connections")
    .update({ status: "error", last_error: message.slice(0, 300), updated_at: new Date().toISOString() })
    .eq("workspace_id", workspaceId)
    .eq("status", "active");
  tokenCache.delete(workspaceId);
}

// Access tokens live ~1h; cache per workspace within this server instance.
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

async function accessToken(conn: ConnectionRow): Promise<string | null> {
  const hit = tokenCache.get(conn.workspace_id);
  if (hit && hit.expiresAt > Date.now() + 60_000) return hit.token;
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
      refresh_token: decryptToken(conn.refresh_token_enc!),
      grant_type: "refresh_token",
    }),
  }).catch(() => null);
  if (!res) return null;
  const t = (await res.json().catch(() => ({}))) as Partial<TokenResponse>;
  if (!res.ok || !t.access_token) {
    // invalid_grant = the owner revoked access or the token expired: stop
    // trying until they reconnect. Anything else is treated as transient.
    if (t.error === "invalid_grant") await markError(conn.workspace_id, "Google access was removed. Reconnect your calendar.");
    else console.error("[gcal] token refresh failed:", res.status, t.error);
    return null;
  }
  tokenCache.set(conn.workspace_id, { token: t.access_token, expiresAt: Date.now() + (t.expires_in ?? 3600) * 1000 });
  return t.access_token;
}

async function calFetch(conn: ConnectionRow, path: string, init: RequestInit = {}): Promise<Response | null> {
  const token = await accessToken(conn);
  if (!token) return null;
  const res = await fetch(`${CAL_API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(5000),
  }).catch((err) => {
    console.error("[gcal] request failed:", path.split("?")[0], err instanceof Error ? err.name : err);
    return null;
  });
  if (res?.status === 401) tokenCache.delete(conn.workspace_id);
  return res;
}

// ── busy times ───────────────────────────────────────────────────────────────

// Slot pages ask for the same week repeatedly; a short cache keeps the Google
// quota (and slot latency) sane without meaningfully delaying new events.
const BUSY_TTL_MS = 60_000;
const busyCache = new Map<string, { at: number; busy: Busy[] }>();

/** Busy ranges on the connected calendar in [from, to). Empty when not connected or on any error. */
export async function googleBusy(workspaceId: string, from: Date, to: Date): Promise<Busy[]> {
  if (!googleCalendarConfigured()) return [];
  const key = `${workspaceId}:${from.toISOString()}:${to.toISOString()}`;
  const hit = busyCache.get(key);
  if (hit && Date.now() - hit.at < BUSY_TTL_MS) return hit.busy;
  try {
    const conn = await activeConnection(workspaceId);
    if (!conn) return [];
    const res = await calFetch(conn, "/freeBusy", {
      method: "POST",
      body: JSON.stringify({ timeMin: from.toISOString(), timeMax: to.toISOString(), items: [{ id: conn.calendar_id }] }),
    });
    if (!res?.ok) {
      if (res) console.error("[gcal] freebusy failed:", res.status);
      return [];
    }
    const body = (await res.json()) as { calendars?: Record<string, { busy?: { start: string; end: string }[]; errors?: unknown[] }> };
    const busy = parseFreeBusy(body, conn.calendar_id);
    if (busyCache.size > 500) busyCache.clear();
    busyCache.set(key, { at: Date.now(), busy });
    return busy;
  } catch (err) {
    console.error("[gcal] busy lookup failed:", err);
    return [];
  }
}

export function parseFreeBusy(
  body: { calendars?: Record<string, { busy?: { start: string; end: string }[] }> },
  calendarId: string,
): Busy[] {
  const cal = body.calendars?.[calendarId] ?? Object.values(body.calendars ?? {})[0];
  return (cal?.busy ?? [])
    .map((b) => ({ start: new Date(b.start), end: new Date(b.end) }))
    .filter((b) => !Number.isNaN(b.start.getTime()) && !Number.isNaN(b.end.getTime()) && b.end > b.start);
}

/**
 * Drops Google busy ranges that lie entirely inside `own` — used when moving a
 * booking, so its own calendar event (which freebusy reports like any other)
 * doesn't block the times around it. A range that also covers other events
 * is kept: blocking too much is safer than double-booking.
 */
export function withoutOwnEvent(busy: Busy[], own: Busy | null): Busy[] {
  if (!own) return busy;
  return busy.filter((b) => !(b.start >= own.start && b.end <= own.end));
}

// ── events ───────────────────────────────────────────────────────────────────

export interface CalendarBooking {
  id: string;
  workspaceId: string;
  workspaceSlug: string;
  serviceName: string;
  startsAt: Date;
  endsAt: Date;
  locationNote: string;
  customer: Record<string, unknown>; // submission values
  gcalEventId: string | null;
  dashboardUrl: string;
}

export function eventBody(b: CalendarBooking) {
  const name = typeof b.customer.name === "string" && b.customer.name.trim() ? b.customer.name.trim() : "";
  const email = submissionEmail(b.customer);
  const phoneKey = Object.keys(b.customer).find((k) => /phone|tel/i.test(k) && !k.startsWith("bk_"));
  const phone = phoneKey && typeof b.customer[phoneKey] === "string" ? (b.customer[phoneKey] as string) : "";
  const details = [
    name && `Customer: ${name}`,
    email && `Email: ${email}`,
    phone && `Phone: ${phone}`,
    b.locationNote && `Location: ${b.locationNote}`,
  ].filter(Boolean);
  const lines = [...details, ...(details.length ? [""] : []), `Manage bookings: ${b.dashboardUrl}`, "Booked through VisionWorkx."];
  return {
    summary: `${b.serviceName}${name ? ` — ${name}` : ""}`.slice(0, 200),
    description: lines.join("\n").slice(0, 4000),
    ...(b.locationNote ? { location: b.locationNote.slice(0, 200) } : {}),
    start: { dateTime: b.startsAt.toISOString() },
    end: { dateTime: b.endsAt.toISOString() },
    extendedProperties: { private: { vwBookingId: b.id } },
  };
}

/** Creates or moves the booking's event. Best effort; logs and returns on failure. */
export async function upsertBookingEvent(b: CalendarBooking): Promise<void> {
  if (!googleCalendarConfigured()) return;
  try {
    const conn = await activeConnection(b.workspaceId);
    if (!conn) return;
    const cal = encodeURIComponent(conn.calendar_id);
    const body = JSON.stringify(eventBody(b));
    if (b.gcalEventId) {
      const res = await calFetch(conn, `/calendars/${cal}/events/${encodeURIComponent(b.gcalEventId)}?sendUpdates=none`, { method: "PATCH", body });
      if (res?.ok) return;
      // Deleted on the owner's side: fall through and create a fresh one.
      if (res && res.status !== 404 && res.status !== 410) {
        console.error("[gcal] event update failed:", res.status);
        return;
      }
      if (!res) return;
    }
    const res = await calFetch(conn, `/calendars/${cal}/events?sendUpdates=none`, { method: "POST", body });
    if (!res?.ok) {
      if (res) console.error("[gcal] event create failed:", res.status);
      return;
    }
    const ev = (await res.json()) as { id?: string };
    if (ev.id) await modulesServiceClient().from("vw_bookings").update({ gcal_event_id: ev.id }).eq("id", b.id);
    busyCache.clear();
  } catch (err) {
    console.error("[gcal] upsert failed:", err);
  }
}

export async function deleteBookingEvent(workspaceId: string, bookingId: string, gcalEventId: string | null): Promise<void> {
  if (!gcalEventId || !googleCalendarConfigured()) return;
  try {
    const conn = await activeConnection(workspaceId);
    if (!conn) return;
    const res = await calFetch(conn, `/calendars/${encodeURIComponent(conn.calendar_id)}/events/${encodeURIComponent(gcalEventId)}?sendUpdates=none`, {
      method: "DELETE",
    });
    if (res && !res.ok && res.status !== 404 && res.status !== 410) {
      console.error("[gcal] event delete failed:", res.status);
      return;
    }
    if (res) await modulesServiceClient().from("vw_bookings").update({ gcal_event_id: null }).eq("id", bookingId);
    busyCache.clear();
  } catch (err) {
    console.error("[gcal] delete failed:", err);
  }
}
