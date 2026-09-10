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
 * Exit code: 0 = every graded golden build passed; 1 = a build failed or
 * nothing could be graded; 2 = the script itself couldn't run (bad env,
 * the API stayed 5xx through every retry, etc).
 */

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_APP_URL = "https://vision-workx.vercel.app";

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

// Retry on 5xx and network errors — a transient Supabase/PostgREST blip
// (e.g. a schema-cache reload) used to crash the whole run.
async function req(url, opts = {}, { retries = 4, label = url } = {}) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, opts);
      if (res.status >= 500) {
        lastErr = new Error(`${label} -> ${res.status} ${(await res.text().catch(() => "")).slice(0, 200)}`);
      } else if (!res.ok) {
        throw new Error(`${label} -> ${res.status} ${(await res.text().catch(() => "")).slice(0, 300)}`);
      } else {
        return res.json();
      }
    } catch (err) {
      lastErr = err;
    }
    if (i < retries) await sleep(3000 * (i + 1));
  }
  throw lastErr;
}

const sb = (path) =>
  req(`${SB_URL}/rest/v1/${path}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  }, { label: `supabase ${path.split("?")[0]}` });

async function hitCron() {
  return req(`${APP_URL}/api/cron/canary-build`, {
    headers: { Authorization: `Bearer ${CRON_SECRET}` },
  }, { label: "canary-build cron" });
}

async function pendingCount() {
  const rows = await sb("build_canary_runs?status=eq.pending&select=id");
  return Array.isArray(rows) ? rows.length : 0;
}

// Latest row per intake_key from the most recent ~30.
async function latestPerKey() {
  const rows = await sb(
    "build_canary_runs?select=intake_key,status,failure_reason,duration_sec,created_at&order=created_at.desc&limit=30",
  );
  if (!Array.isArray(rows)) return [];
  const seen = new Set();
  const out = [];
  for (const r of rows) {
    if (seen.has(r.intake_key)) continue;
    seen.add(r.intake_key);
    out.push(r);
  }
  return out;
}

function printRuns(runs) {
  console.log("\n  intake            result   detail");
  console.log("  ────────────────  ───────  ─────────────────────────────────");
  if (runs.length === 0) {
    console.log("  (no canary runs found)");
    return;
  }
  for (const r of runs) {
    const detail =
      r.status === "pass"
        ? r.duration_sec
          ? `${Math.round(r.duration_sec / 60)} min`
          : ""
        : r.failure_reason || "";
    console.log(`  ${String(r.intake_key).padEnd(16)}  ${String(r.status).padEnd(7)}  ${detail}`);
  }
}

(async () => {
  if (mode !== "--grade") {
    console.log("Firing golden-intake canary set…");
    const out = await hitCron();
    console.log("  fired:", out.fired?.join(", ") || "(none)");
    if (out.graded && Object.keys(out.graded).length) console.log("  graded previous:", JSON.stringify(out.graded));
    if (out.skipped) console.log("  skipped:", out.skipped);
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
    await hitCron().catch((e) => console.log(`  (re-grade blip: ${e.message || e})`));
    pending = await pendingCount();
  }

  const runs = await latestPerKey();
  printRuns(runs);
  const graded = runs.filter((r) => r.status === "pass" || r.status === "fail");
  const passed = graded.filter((r) => r.status === "pass").length;
  console.log(
    `\n  ${passed}/${graded.length} passed` +
      (pending > 0 ? `  (${pending} still running — re-run --grade later)` : ""),
  );
  process.exit(graded.length > 0 && passed === graded.length ? 0 : 1);
})().catch((e) => {
  console.error("canary.mjs:", e.message || e);
  process.exit(2);
});
