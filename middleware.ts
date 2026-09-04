import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import type { Database } from "@/lib/database.types";

const TRIAL_DAYS = 14;

// Routes that redirect authenticated users away (login/signup)
const AUTH_ONLY_ROUTES = ["/login", "/signup"];
// Routes that require a valid session
const AUTH_REQUIRED = ["/dashboard", "/onboard", "/generate", "/billing", "/partner"];
// Routes that additionally require an active subscription or in-trial status
const SUBSCRIPTION_REQUIRED = ["/onboard", "/generate"];

// Site-wide maintenance gate, checked before anything else below — it's
// session-agnostic (even a signed-out marketing-page visitor should see it)
// and controlled from Revalor Admin via the Supabase Management API (see
// revalor-admin's lib/maintenance.ts). Reads system_settings with the anon
// key over plain REST rather than the @supabase/ssr client below: it's a
// public, unauthenticated read (see the migration's RLS policy), and this
// keeps it a single fast fetch with no cookie plumbing. This app's own
// /admin dashboard is exempt so an operator can still get in to fix things.
const MAINTENANCE_BYPASS_PREFIXES = ["/maintenance", "/admin", "/api"];

async function checkMaintenanceMode(req: NextRequest): Promise<NextResponse | null> {
  const path = req.nextUrl.pathname;
  if (MAINTENANCE_BYPASS_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))) return null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  try {
    const res = await fetch(`${url}/rest/v1/system_settings?id=eq.1&select=maintenance_mode,maintenance_message`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
      // Runs on every request; a short cache avoids hitting the DB on every
      // single page load without meaningfully delaying a maintenance flip.
      next: { revalidate: 10 },
    });
    if (!res.ok) return null;
    const rows: { maintenance_mode: boolean; maintenance_message: string }[] = await res.json();
    const settings = rows[0];
    if (!settings?.maintenance_mode) return null;

    const maintenanceUrl = new URL("/maintenance", req.url);
    maintenanceUrl.searchParams.set("message", settings.maintenance_message);
    return NextResponse.redirect(maintenanceUrl);
  } catch {
    // Fail open — a Supabase hiccup shouldn't take the whole site down on
    // top of it.
    return null;
  }
}

export async function middleware(req: NextRequest) {
  const maintenanceRedirect = await checkMaintenanceMode(req);
  if (maintenanceRedirect) return maintenanceRedirect;

  // The matcher below is now site-wide (needed for the maintenance check
  // above to cover the marketing pages too), but everything past this point
  // — a network round-trip to validate the session — was written for, and
  // should stay scoped to, only the routes that actually care about auth.
  const path = req.nextUrl.pathname;
  const needsAuthCheck =
    AUTH_ONLY_ROUTES.some((r) => path.startsWith(r)) || AUTH_REQUIRED.some((r) => path.startsWith(r));
  if (!needsAuthCheck) return NextResponse.next();

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

  // Redirect signed-in users away from auth pages
  if (AUTH_ONLY_ROUTES.some((r) => path.startsWith(r)) && user) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  // Redirect unauthenticated users to login
  if (AUTH_REQUIRED.some((r) => path.startsWith(r)) && !user) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("next", path);
    return NextResponse.redirect(loginUrl);
  }

  // A blocked account (set from Revalor Admin, e.g. a payment dispute) is
  // checked for every authenticated route, ahead of the subscription gate
  // below, which only applies to a subset of them.
  if (user && AUTH_REQUIRED.some((r) => path.startsWith(r))) {
    // Use service role to bypass RLS — user identity is already verified above via getUser()
    const serviceClient = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: profile } = await serviceClient
      .from("profiles")
      .select("created_at, blocked, block_reason")
      .eq("id", user.id)
      .single();

    if (profile?.blocked) {
      const blockedUrl = new URL("/account-blocked", req.url);
      if (profile.block_reason) blockedUrl.searchParams.set("reason", profile.block_reason);
      return NextResponse.redirect(blockedUrl);
    }

    // Gate /onboard and /generate behind an active subscription or free trial
    if (SUBSCRIPTION_REQUIRED.some((r) => path.startsWith(r))) {
      const { data: subscription } = await serviceClient
        .from("subscriptions")
        .select("status")
        .eq("user_id", user.id)
        .in("status", ["active", "trialing"])
        .maybeSingle();

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
  }

  return response;
}

// Broadened from the original route-scoped list to every path (minus
// static assets) so checkMaintenanceMode above can apply site-wide,
// including the marketing pages — the auth/subscription/block checks
// further up remain scoped to their own path arrays regardless, so this
// broadening doesn't change their behavior.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
