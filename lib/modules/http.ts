import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { isAllowedOrigin } from "./domains";

/** Origin allowed to call module APIs: our own (iframe mode) or a workspace domain (shadow mode). */
export function originAllowed(req: NextRequest, domains: string[]): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  if (origin === req.nextUrl.origin) return true;
  return isAllowedOrigin(origin, domains);
}

export function corsHeaders(req: NextRequest, domains: string[]): Record<string, string> {
  const origin = req.headers.get("origin");
  if (!origin || origin === req.nextUrl.origin || !isAllowedOrigin(origin, domains)) return { Vary: "Origin" };
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}

export function json(req: NextRequest, domains: string[], body: unknown, status = 200, extra: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { ...corsHeaders(req, domains), ...extra } });
}

export function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

/** One-way hash so rate-limit keys never store raw IPs. */
export function ipHash(req: NextRequest): string {
  const salt = process.env.MODULES_SUPABASE_SERVICE_ROLE_KEY?.slice(-24) ?? "vw";
  return createHash("sha256").update(`${salt}:${clientIp(req)}`).digest("hex").slice(0, 32);
}
