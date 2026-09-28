import { NextRequest, NextResponse } from "next/server";
import { verifyTicket, signSessionCookie, ADMIN_SSO_COOKIE, ADMIN_EMAIL } from "@/lib/adminSso";
import { safeNextPath } from "@/lib/safeRedirect";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  // Only a same-origin path is accepted (see lib/safeRedirect.ts).
  const next = safeNextPath(req.nextUrl.searchParams.get("next"), "/admin");

  if (!token || !verifyTicket(token, ADMIN_EMAIL)) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const response = NextResponse.redirect(new URL(next, req.url));
  response.cookies.set(ADMIN_SSO_COOKIE, signSessionCookie(ADMIN_EMAIL), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return response;
}
