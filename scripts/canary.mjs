/**
 * Vision Workx — manual golden-intake canary
 *
 * Run this BEFORE shipping a change to the generation prompt or the
 * generate/deploy pipeline. It fires the golden-intake set through the
 * real build pipeline and reports the pass rate — a green run is your
 * go/no-go signal.
 *
 *   node scripts/canary.mjs           # fire + wait + grade (up to ~25 min)
 *   node scripts/canary.mjs --fire    # just kick it off, don't wait
 *   node scripts/canary.mjs --grade   # just grade whatever's pending now
 *
 * Requires in .env.local:
 *   CRON_SECRET, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL
 *   NEXT_PUBLIC_APP_URL (falls back to production)
 *
 * Exit code is non-zero if any golden build failed.
 */

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_APP_URL = "https://vision-workx.vercel.app";
const GOLDEN_COUNT = 4;

function loadEnvLocal() {
  const env = {};
  try {
    for (const line of readFileSync(join(ROOT, ".env.local"), "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq === -1) continue;
      env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
    }
  } catch {}
  return env;
}

const env = { ...loadEnvLocal(), ...process.env };
const APP_URL = env.NEXT_PUBLIC_APP_URL || DEFAULT_APP_URL;
const CRON_SECRET = env.CRON_SECRET;
const SB_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!CRON_SECRET || !SB_URL || !SB_KEY) {
  console.error("Missing CRON_SECRET / NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(2);
}

const mode = process.argv[2] || "";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function hitCron() {
  const res = await fetch(`${APP_URL}/api/cron/canary-build`, {
    headers: { Authorization: `Bearer ${CRON_SECRET}` },
  });
  if (!res.ok) throw new Error(`canary-build cron ${res.status}: ${await res.text()}`);
  return res.json();
}

async function pendingCount() {
  const res = await fetch(
    `${SB_URL}/rest/v1/build_canary_runs?status=eq.pending&select=id`,
    { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } },
  );
  return (await res.json()).length;
}

async function recent(n = 8) {
  const res = await fetch(
    `${SB_URL}/rest/v1/build_canary_runs?select=intake_key,status,failure_reason,duration_sec,created_at&order=created_at.desc&limit=${n}`,
    { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } },
  );
  return res.json();
}

function printRuns(runs) {
  console.log("\n  intake            result   detail");
  console.log("  ────────────────  ───────  ─────────────────────────────────");
  for (const r of runs) {
    const detail =
      r.status === "pass"
        ? r.duration_sec
          ? `${Math.round(r.duration_sec / 60)} min`
          : ""
        : r.failure_reason || "";
    console.log(`  ${r.intake_key.padEnd(16)}  ${r.status.padEnd(7)}  ${detail}`);
  }
}

(async () => {
  if (mode !== "--grade") {
    console.log("Firing golden-intake canary set…");
    const out = await hitCron();
    console.log("  fired:", out.fired?.join(", ") || "(none)");
    if (out.graded && Object.keys(out.graded).length) console.log("  graded previous:", JSON.stringify(out.graded));
    if (mode === "--fire") {
      console.log("\nRun `node scripts/canary.mjs --grade` in ~10-15 min.");
      return;
    }
  }

  // Wait for the builds to finish, then grade via a second cron hit.
  const deadline = Date.now() + 25 * 60 * 1000;
  let pending = await pendingCount();
  while (pending > 0 && Date.now() < deadline) {
    console.log(`  ${pending} build(s) still running… (${new Date().toLocaleTimeString()})`);
    await sleep(60_000);
    await hitCron().catch(() => {}); // re-grade as they land
    pending = await pendingCount();
  }

  const runs = await recent(GOLDEN_COUNT);
  printRuns(runs);
  const graded = runs.filter((r) => r.status === "pass" || r.status === "fail");
  const passed = graded.filter((r) => r.status === "pass").length;
  console.log(`\n  ${passed}/${graded.length} passed` + (pending > 0 ? `  (${pending} still running — re-run --grade later)` : ""));
  process.exit(graded.length > 0 && passed === graded.length ? 0 : 1);
})().catch((e) => {
  console.error(e.message || e);
  process.exit(2);
});
