import { NextRequest, NextResponse } from "next/server";
import { verifyTicket, signSessionCookie, ADMIN_SSO_COOKIE, ADMIN_EMAIL } from "@/lib/adminSso";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");

  if (!token || !verifyTicket(token, ADMIN_EMAIL)) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const response = NextResponse.redirect(new URL("/admin", req.url));
  response.cookies.set(ADMIN_SSO_COOKIE, signSessionCookie(ADMIN_EMAIL), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return response;
}
