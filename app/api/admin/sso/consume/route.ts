import { NextRequest, NextResponse } from "next/server";
import { verifyTicket, signSessionCookie, ADMIN_SSO_COOKIE, ADMIN_EMAIL } from "@/lib/adminSso";

// Only a same-origin relative path is accepted (must start with a single
// "/", never "//" — a protocol-relative URL would redirect off-site).
function safeNextPath(value: string | null): string {
  if (value && value.startsWith("/") && !value.startsWith("//")) return value;
  return "/admin";
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const next = safeNextPath(req.nextUrl.searchParams.get("next"));

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
