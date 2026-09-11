// Platform-owned — browser Supabase client ONLY.
// Client Components ("use client") import `createClient` from here.
// Server code must import `createServerSupabaseClient` from `@/lib/supabase-server`.
import { createBrowserClient } from "@supabase/ssr";

const SCHEMA = process.env.NEXT_PUBLIC_SUPABASE_SCHEMA || "public";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { db: { schema: SCHEMA } },
  );
}
