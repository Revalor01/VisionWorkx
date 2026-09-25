import { createBrowserClient } from "@supabase/ssr";
import { MODULES_AUTH_COOKIE } from "./constants";

// Browser client for the modules database (workspace members; RLS applies).
let _client: ReturnType<typeof createBrowserClient> | undefined;

export function modulesBrowserClient() {
  if (!_client) {
    _client = createBrowserClient(
      process.env.NEXT_PUBLIC_MODULES_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_MODULES_SUPABASE_ANON_KEY!,
      { cookieOptions: { name: MODULES_AUTH_COOKIE } },
    );
  }
  return _client;
}
