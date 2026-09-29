import { sweepStaleTestData } from "./lib/modules";
import { sanctumConfigured, sweepStaleSanctumUsers } from "./lib/sanctum";

// Before each run: remove test data a crashed earlier run left behind, for
// each product this run covers whose database is configured.
export default async function globalSetup() {
  const only = process.env.QA_PRODUCT || "";
  const sweeps: [string, boolean, () => Promise<void>][] = [
    ["visionworkx", !!(process.env.MODULES_SUPABASE_URL && process.env.MODULES_SUPABASE_SERVICE_ROLE_KEY), () => sweepStaleTestData()],
    ["sanctum", sanctumConfigured(), () => sweepStaleSanctumUsers()],
  ];
  for (const [product, configured, sweep] of sweeps) {
    if (!configured || (only && only !== product)) continue;
    try {
      await sweep();
    } catch (err) {
      console.warn(`[qa] ${product} stale-data sweep failed:`, err instanceof Error ? err.message : err);
    }
  }
}
