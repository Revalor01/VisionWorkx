import { createClient } from "@supabase/supabase-js";
import { createServerClient as createSSRServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { MODULES_AUTH_COOKIE } from "./constants";

// Clients for the VisionWorkx MODULES database (dedicated Supabase project,
// separate from the main VisionWorkx project — see supabase-modules/). Its
// Supabase Auth pool holds client (workspace) logins only.
//
// The URL/key env vars are read lazily so the rest of the app keeps building
// and running when they aren't configured yet.

export { MODULES_AUTH_COOKIE } from "./constants";

function url(): string {
  const v = process.env.NEXT_PUBLIC_MODULES_SUPABASE_URL ?? process.env.MODULES_SUPABASE_URL;
  if (!v) throw new Error("NEXT_PUBLIC_MODULES_SUPABASE_URL / MODULES_SUPABASE_URL is not set");
  return v;
}

export function modulesConfigured(): boolean {
  return !!(
    (process.env.NEXT_PUBLIC_MODULES_SUPABASE_URL ?? process.env.MODULES_SUPABASE_URL) &&
    process.env.MODULES_SUPABASE_SERVICE_ROLE_KEY &&
    process.env.NEXT_PUBLIC_MODULES_SUPABASE_ANON_KEY
  );
}

// Service role — bypasses RLS. Server-only (route handlers / server components).
// Never import this from a "use client" file.
export function modulesServiceClient() {
  const key = process.env.MODULES_SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("MODULES_SUPABASE_SERVICE_ROLE_KEY is not set");
  return createClient(url(), key, { auth: { autoRefreshToken: false, persistSession: false } });
}

// Cookie-session client for signed-in workspace members (RLS applies).
export async function modulesServerClient() {
  const cookieStore = await cookies();
  return createSSRServerClient(url(), process.env.NEXT_PUBLIC_MODULES_SUPABASE_ANON_KEY!, {
    cookieOptions: { name: MODULES_AUTH_COOKIE },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Read-only during Server Component render; auth reads still work.
        }
      },
    },
  });
}
