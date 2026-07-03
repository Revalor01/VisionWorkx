import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import type { Database } from "@/lib/database.types";

const TRIAL_DAYS = 14;

// Routes that redirect authenticated users away (login/signup)
const AUTH_ONLY_ROUTES = ["/login", "/signup"];
// Routes that require a valid session
const AUTH_REQUIRED = ["/dashboard", "/onboard", "/generate", "/billing"];
// Routes that additionally require an active subscription or in-trial status
const SUBSCRIPTION_REQUIRED = ["/onboard", "/generate"];

export async function middleware(req: NextRequest) {
  let response = NextResponse.next({ request: req });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Apply to request first, then to response (standard SSR pattern)
          cookiesToSet.forEach(({ name, value }) =>
            req.cookies.set(name, value)
          );
          response = NextResponse.next({ request: req });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // getUser() validates the session server-side (not just reads the cookie)
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = req.nextUrl.pathname;

  // Redirect signed-in users away from auth pages
  if (AUTH_ONLY_ROUTES.some((r) => path.startsWith(r)) && user) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  // Redirect unauthenticated users to login
  if (AUTH_REQUIRED.some((r) => path.startsWith(r)) && !user) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("redirectTo", path);
    return NextResponse.redirect(loginUrl);
  }

  // Gate /onboard and /generate behind an active subscription or free trial
  if (user && SUBSCRIPTION_REQUIRED.some((r) => path.startsWith(r))) {
    // Use service role to bypass RLS — user identity is already verified above via getUser()
    const serviceClient = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const [{ data: profile }, { data: subscription }] = await Promise.all([
      serviceClient
        .from("profiles")
        .select("created_at")
        .eq("id", user.id)
        .single(),
      serviceClient
        .from("subscriptions")
        .select("status")
        .eq("user_id", user.id)
        .in("status", ["active", "trialing"])
        .maybeSingle(),
    ]);

    const hasActiveSub = subscription !== null;

    const createdAt = profile?.created_at
      ? new Date(profile.created_at)
      : null;
    const trialEnd = createdAt
      ? new Date(createdAt.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000)
      : null;
    const isInTrial = trialEnd ? new Date() < trialEnd : false;

    if (!hasActiveSub && !isInTrial) {
      return NextResponse.redirect(new URL("/billing", req.url));
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/onboard/:path*",
    "/generate/:path*",
    "/billing/:path*",
    "/login",
    "/signup",
  ],
};
