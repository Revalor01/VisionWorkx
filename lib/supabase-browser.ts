import { createBrowserClient as createSSRBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/database.types";

// Module-level singleton so session state is shared across all client components.
// A single instance means the session loaded at login is already initialized
// when any other component (e.g. OnboardForm) makes a database call.
let _client: ReturnType<typeof createSSRBrowserClient<Database>> | undefined;

export function createBrowserClient() {
  if (!_client) {
    _client = createSSRBrowserClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return _client;
}
