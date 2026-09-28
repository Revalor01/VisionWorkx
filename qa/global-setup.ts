import { sweepStaleTestData } from "./lib/modules";

// Before each run: remove test data a crashed earlier run left behind.
// Skipped when the modules database isn't configured (e.g. public-only runs).
export default async function globalSetup() {
  if (!process.env.MODULES_SUPABASE_URL || !process.env.MODULES_SUPABASE_SERVICE_ROLE_KEY) return;
  try {
    await sweepStaleTestData();
  } catch (err) {
    console.warn("[qa] stale-data sweep failed:", err instanceof Error ? err.message : err);
  }
}
