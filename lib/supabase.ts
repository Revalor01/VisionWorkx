import { createClient } from "@supabase/supabase-js";
import { createServerClient as createSSRServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/database.types";

// Browser client — import from lib/supabase-browser instead (no next/headers).

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Server client with cookie-based session — use in Server Components and Route Handlers.
export async function createServerClient() {
  const cookieStore = await cookies();

  return createSSRServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Throws during Server Component render (read-only context).
          // Auth reads still work fine.
        }
      },
    },
  });
}

// Service role client — bypasses RLS. Use ONLY in server-side API routes (e.g. Stripe webhooks).
// Never expose SUPABASE_SERVICE_ROLE_KEY to the browser.
export function createServiceClient() {
  return createClient<Database>(
    supabaseUrl,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// Service role client scoped to a generated app's own tenant schema (e.g. "app_c0640777").
// Use ONLY in server-side API routes that need to read/write a specific tenant's tables
// directly (e.g. site_settings) — same trust level as createServiceClient, just schema-scoped.
export function createTenantServiceClient(schema: string) {
  return createClient(
    supabaseUrl,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { db: { schema }, auth: { autoRefreshToken: false, persistSession: false } }
  );
}
