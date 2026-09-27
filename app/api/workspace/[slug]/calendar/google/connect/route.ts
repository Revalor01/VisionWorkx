import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/modules/ownerApi";
import { authUrl, CALLBACK_PATH, googleCalendarConfigured, STATE_COOKIE, STATE_TTL_S } from "@/lib/modules/googleCalendar";
import { signState } from "@/lib/modules/tokenCrypto";

// Owner clicks "Connect Google Calendar" (a plain link, so this is a GET):
// send them to Google's consent screen. The signed `state` names the
// workspace and owner; the nonce cookie ties it to this browser, so a
// callback URL can't be replayed into someone else's session.
export const runtime = "nodejs";

export async function GET(req: NextRequest, props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const settings = new URL(`/workspace/${slug}/settings`, req.nextUrl.origin);
  const auth = await requireOwner(slug);
  if ("error" in auth) {
    if (auth.error?.status === 401) return NextResponse.redirect(new URL(`/workspace/login?next=${encodeURIComponent(settings.pathname)}`, req.nextUrl.origin));
    return auth.error;
  }
  if (!googleCalendarConfigured()) {
    settings.searchParams.set("calendar", "unavailable");
    return NextResponse.redirect(settings);
  }

  const nonce = randomBytes(16).toString("base64url");
  const state = signState({ w: auth.workspace.id, s: slug, u: auth.user.id, n: nonce, e: Date.now() + STATE_TTL_S * 1000 });
  const res = NextResponse.redirect(authUrl({ redirectUri: `${req.nextUrl.origin}${CALLBACK_PATH}`, state }));
  res.cookies.set(STATE_COOKIE, nonce, {
    httpOnly: true,
    secure: req.nextUrl.protocol === "https:",
    sameSite: "lax",
    path: CALLBACK_PATH,
    maxAge: STATE_TTL_S,
  });
  return res;
}
