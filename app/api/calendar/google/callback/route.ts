import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/modules/ownerApi";
import { CALLBACK_PATH, exchangeCode, googleCalendarConfigured, saveConnection, STATE_COOKIE } from "@/lib/modules/googleCalendar";
import { verifyState } from "@/lib/modules/tokenCrypto";

// Google sends the owner back here after the consent screen. One fixed URL
// for every workspace (it must be registered in Google Cloud); the signed
// state says which workspace. Always ends on the workspace's Settings page
// with ?calendar=<outcome> for the card to show.
export const runtime = "nodejs";

type State = { w: string; s: string; u: string; n: string; e: number };

export async function GET(req: NextRequest) {
  if (!googleCalendarConfigured()) return NextResponse.json({ error: "Calendar sync isn't set up yet." }, { status: 503 });
  const params = req.nextUrl.searchParams;
  const state = verifyState<State>(params.get("state") ?? "");
  if (!state || typeof state.s !== "string" || typeof state.n !== "string" || typeof state.e !== "number" || !/^[a-z0-9-]{3,48}$/.test(state.s)) {
    return NextResponse.json({ error: "This link has expired. Start again from Settings." }, { status: 400 });
  }

  const settings = new URL(`/workspace/${state.s}/settings`, req.nextUrl.origin);
  const done = (outcome: string) => {
    settings.searchParams.set("calendar", outcome);
    const res = NextResponse.redirect(settings);
    res.cookies.set(STATE_COOKIE, "", { path: CALLBACK_PATH, maxAge: 0 });
    return res;
  };

  const nonce = req.cookies.get(STATE_COOKIE)?.value ?? "";
  const sameBrowser = nonce.length === state.n.length && timingSafeEqual(Buffer.from(nonce), Buffer.from(state.n));
  if (!sameBrowser || Date.now() > state.e) return done("expired");
  if (params.get("error")) return done("cancelled"); // owner clicked Cancel on Google's screen

  // Still signed in as the same owner of the same workspace.
  const auth = await requireOwner(state.s);
  if ("error" in auth || auth.user.id !== state.u || auth.workspace.id !== state.w) return done("expired");

  const code = params.get("code");
  if (!code) return done("error");
  const r = await exchangeCode(code, `${req.nextUrl.origin}${CALLBACK_PATH}`);
  if (!r.ok) return done(r.reason === "missing_scopes" ? "missing_scopes" : "error");
  const saved = await saveConnection({ workspaceId: state.w, userId: state.u, email: r.email, refreshToken: r.refreshToken });
  return done(saved ? "connected" : "error");
}
