// Tier 3 (T3.1) — the manual "prove it before merging" step this session did
// by hand, packaged as a reusable command. Fires a fresh golden-intake batch
// against the LIVE deployed pipeline (production) and polls until every
// intake is graded, then exits non-zero if any failed.
//
// Local:
//   node scripts/run-golden-canary.mjs
// CI (workflow_dispatch, see .github/workflows/golden-canary.yml):
//   same script, reads the same env vars from GitHub secrets.
//
// Needs: APP_URL (default https://vision-workx.vercel.app), CRON_SECRET,
// NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
//
// Note: this exercises whatever is currently DEPLOYED, not the PR's branch —
// there's no preview-deploy wiring for the generate/deploy pipeline. Run it
// after a risk-surface change has been deployed (or is about to be), not
// as a pre-merge gate on every PR — a full cycle is ~15-45 min and costs
// real AI + compute.
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
const MAX_WAIT_MS = 45 * 60_000;

for (const [name, v] of Object.entries({ CRON_SECRET, SUPABASE_URL, SERVICE_KEY })) {
  if (!v) { console.error(`Missing ${name} (env var or .env.local)`); process.exit(2); }
}

async function restQuery(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!res.ok) throw new Error(`REST ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

console.log(`Triggering golden canary against ${APP_URL} ...`);
const since = new Date().toISOString();
const trigRes = await fetch(`${APP_URL}/api/cron/canary-build`, {
  headers: { Authorization: `Bearer ${CRON_SECRET}` },
});
if (!trigRes.ok) {
  console.error(`Trigger failed: ${trigRes.status} ${(await trigRes.text()).slice(0, 500)}`);
  process.exit(2);
}
const trig = await trigRes.json();
console.log("Trigger response:", JSON.stringify(trig));
if (trig.skipped) {
  console.log(`A set was already in flight (${trig.skipped}) — nothing new fired this run.`);
}

console.log(`Polling build_canary_runs created after ${since} ...`);
const deadline = Date.now() + MAX_WAIT_MS;
let rows = [];
while (Date.now() < deadline) {
  rows = await restQuery(
    `build_canary_runs?created_at=gte.${encodeURIComponent(since)}&select=intake_key,status,failure_reason,duration_sec&order=intake_key`,
  );
  const pending = rows.filter((r) => r.status === "pending");
  const line = GOLDEN_KEYS.map((k) => {
    const r = rows.find((x) => x.intake_key === k);
    return `${k.padEnd(12)} ${r ? r.status + (r.failure_reason ? ` (${r.failure_reason})` : "") : "not fired yet"}`;
  }).join("\n  ");
  console.log(`[${new Date().toISOString().slice(11, 19)}]\n  ${line}`);
  if (rows.length >= GOLDEN_KEYS.length && pending.length === 0) break;
  await new Promise((r) => setTimeout(r, POLL_MS));
}

const byKey = Object.fromEntries(GOLDEN_KEYS.map((k) => [k, rows.find((r) => r.intake_key === k)]));
const missing = GOLDEN_KEYS.filter((k) => !byKey[k] || byKey[k].status === "pending");
const failed = GOLDEN_KEYS.filter((k) => byKey[k]?.status === "fail");
const passed = GOLDEN_KEYS.filter((k) => byKey[k]?.status === "pass");

console.log(`\n${"=".repeat(60)}\nSUMMARY: ${passed.length}/5 pass, ${failed.length}/5 fail, ${missing.length}/5 never graded\n${"=".repeat(60)}`);
for (const k of GOLDEN_KEYS) {
  const r = byKey[k];
  console.log(`  ${k.padEnd(12)} ${r ? r.status : "TIMEOUT"}${r?.failure_reason ? ` — ${r.failure_reason}` : ""}`);
}

process.exit(failed.length === 0 && missing.length === 0 ? 0 : 1);
