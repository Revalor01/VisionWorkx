// Platform-owned — server Supabase client ONLY.
// Every Server Component, layout, or route handler imports
// `createServerSupabaseClient` from here — NEVER from `@/lib/supabase`
// (that file's `next/headers` import would break any Client Component bundle).
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const SCHEMA = process.env.NEXT_PUBLIC_SUPABASE_SCHEMA || "public";

export function createServerSupabaseClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: { schema: SCHEMA },
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: Record<string, unknown>) {
          try {
            cookieStore.set({ name, value, ...(options as object) });
          } catch {}
        },
        remove(name: string, options: Record<string, unknown>) {
          try {
            cookieStore.set({ name, value: "", ...(options as object) });
          } catch {}
        },
      },
    },
  );
}

export function createServiceRoleClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: { schema: SCHEMA },
      cookies: { get: () => undefined, set: () => {}, remove: () => {} },
    },
  );
}

export {
  createServerSupabaseClient as createServerBaseClient,
  createServerSupabaseClient as createClient,
};
