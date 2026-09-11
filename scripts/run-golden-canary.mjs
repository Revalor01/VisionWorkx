// Tier 3 (T3.1) — the manual "prove it before merging" step this session did
// by hand, packaged as a reusable command. Fires a fresh golden-intake batch
// against the LIVE deployed pipeline (production), polls the underlying apps
// (not build_canary_runs.status — that only updates when something re-invokes
// the grading step, which won't happen until the next scheduled/manual
// trigger) until every intake reaches a terminal state, then calls the
// endpoint once more to grade this batch for real (updating
// build_canary_runs / the /admin streak) and fires the next batch — exactly
// what the nightly cron does, just run once, now.
//
// Local:
//   node scripts/run-golden-canary.mjs
// CI (workflow_dispatch, see .github/workflows/golden-canary.yml):
//   same script, reads the same env vars from GitHub secrets.
//
// Needs: APP_URL (default https://vision-workx.vercel.app), CRON_SECRET,
// NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
import { readFileSync, existsSync } from "fs";

const env = { ...process.env };
const envLocal = new URL("../.env.local", import.meta.url).pathname;
if (existsSync(envLocal)) {
  for (const l of readFileSync(envLocal, "utf8").split("\n")) {
    const t = l.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0) env[t.slice(0, i).trim()] ||= t.slice(i + 1).trim();
  }
}

const APP_URL = env.APP_URL || env.NEXT_PUBLIC_APP_URL || "https://vision-workx.vercel.app";
const CRON_SECRET = env.CRON_SECRET;
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const GOLDEN_KEYS = ["booking", "booking_crm", "invoicing", "portal", "storefront"];
const POLL_MS = 30_000;
const MAX_WAIT_MS = 40 * 60_000; // leave headroom under the Action's 50 min timeout

for (const [name, v] of Object.entries({ CRON_SECRET, SUPABASE_URL, SERVICE_KEY })) {
  if (!v) { console.error(`Missing ${name} (env var or .env.local)`); process.exit(2); }
}

async function rest(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!res.ok) throw new Error(`REST ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

async function triggerCanary() {
  const res = await fetch(`${APP_URL}/api/cron/canary-build`, {
    headers: { Authorization: `Bearer ${CRON_SECRET}` },
  });
  if (!res.ok) throw new Error(`Trigger failed: ${res.status} ${(await res.text()).slice(0, 500)}`);
  return res.json();
}

console.log(`Triggering golden canary against ${APP_URL} ...`);
const since = new Date().toISOString();
const trig = await triggerCanary();
console.log("Trigger response:", JSON.stringify(trig));
if (trig.skipped) {
  console.log(`A set was already in flight (${trig.skipped}) — nothing new fired this run.`);
  process.exit(2);
}

// The rows exist immediately (status:"pending"); app_id is set right away too.
await new Promise((r) => setTimeout(r, 5_000));
const runs = await rest(
  `build_canary_runs?created_at=gte.${encodeURIComponent(since)}&select=intake_key,app_id`,
);
const appIdByKey = Object.fromEntries(runs.map((r) => [r.intake_key, r.app_id]));
const missingKeys = GOLDEN_KEYS.filter((k) => !appIdByKey[k]);
if (missingKeys.length) {
  console.error(`Some intakes never got an app_id (couldn't start?): ${missingKeys.join(", ")}`);
}

console.log(`Polling apps for a terminal status ...`);
const TERMINAL = new Set(["deployed", "failed", "deploy_failed"]);
const deadline = Date.now() + MAX_WAIT_MS;
let appsByKey = {};
while (Date.now() < deadline) {
  const ids = Object.values(appIdByKey).filter(Boolean);
  const rows = ids.length
    ? await rest(`apps?id=in.(${ids.join(",")})&select=id,status,failure_reason`)
    : [];
  appsByKey = Object.fromEntries(
    GOLDEN_KEYS.map((k) => [k, rows.find((r) => r.id === appIdByKey[k])]),
  );
  const line = GOLDEN_KEYS.map((k) => {
    const a = appsByKey[k];
    return `${k.padEnd(12)} ${a ? a.status + (a.failure_reason ? ` (${a.failure_reason})` : "") : "did not start"}`;
  }).join("\n  ");
  console.log(`[${new Date().toISOString().slice(11, 19)}]\n  ${line}`);
  const allDone = GOLDEN_KEYS.every((k) => !appIdByKey[k] || TERMINAL.has(appsByKey[k]?.status));
  if (allDone) break;
  await new Promise((r) => setTimeout(r, POLL_MS));
}

// Grade this batch for real (updates build_canary_runs + the /admin streak)
// and advance the pipeline — this is exactly what the next scheduled tick
// would do; running it now just does it immediately instead of waiting.
console.log("\nGrading this batch and advancing the pipeline ...");
const graded = await triggerCanary();
console.log("Grade response:", JSON.stringify(graded));

const results = GOLDEN_KEYS.map((k) => ({
  key: k,
  graded: graded.graded?.[k] ?? null,
  appStatus: appsByKey[k]?.status ?? "did not start",
  failureReason: appsByKey[k]?.failure_reason ?? null,
}));

console.log(`\n${"=".repeat(60)}\nSUMMARY\n${"=".repeat(60)}`);
for (const r of results) {
  console.log(`  ${r.key.padEnd(12)} ${(r.graded ?? r.appStatus)}${r.failureReason ? ` — ${r.failureReason}` : ""}`);
}
const pass = results.filter((r) => r.graded === "pass").length;
const fail = results.filter((r) => r.graded === "fail" || (!r.graded && r.appStatus !== "deployed")).length;
console.log(`\n${pass}/5 pass, ${fail}/5 fail`);

process.exit(fail === 0 && pass === 5 ? 0 : 1);
