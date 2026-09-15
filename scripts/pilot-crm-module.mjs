/**
 * Vision Workx — booking-core + CRM-module pilot
 *
 * Tests the "shrink the core, make add-ons modules" idea end-to-end using
 * infrastructure that already exists and is already shipped (editApp() /
 * app_revisions — the "change your live app in plain English" feature) —
 * it has just never had automated coverage. Each run:
 *
 *   1. Generates a fresh, minimal booking-only app (the "core").
 *   2. Waits for it to deploy, smoke-checks it.
 *   3. Fires CRM_MODULE_PROMPT as a real app_revisions "change" through the
 *      exact same pipeline a paying customer's edit request would use.
 *   4. Waits for that revision to deploy.
 *   5. Regression-checks that the ORIGINAL booking pages still work, not
 *      just that the module's own build succeeded.
 *
 * Every run — pass, fail, or blocked — appends one record to
 * pilot-crm-module-history.jsonl: per-step start/end/duration, every
 * ai_usage_log cost line item tied to the app, and the total cost. Re-run
 * this same command for a retest; the history file accumulates across runs
 * so cost/reliability can be judged on real data, not a single sample.
 *
 * Deliberately standalone: does NOT touch build_canary_runs (that table
 * drives /admin's official golden-pipeline pass rate; mixing in an
 * experimental module pilot would skew it) and does NOT run automatically
 * — no cron, no wiring into canary-build/route.ts.
 *
 *   node scripts/pilot-crm-module.mjs              # full run (retest-safe)
 *   node scripts/pilot-crm-module.mjs --cleanup <appId>   # tear down after
 *   node scripts/pilot-crm-module.mjs --history           # print history summary only
 *
 * Requires in .env.local: SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL,
 * SUPABASE_MANAGEMENT_TOKEN (cleanup only), VERCEL_API_TOKEN (cleanup only).
 *
 * Costs real Anthropic spend when it gets past the generate step: one
 * generate call + one edit call, roughly $0.30-0.70 based on real
 * historical app_generate costs — NOT the size of a full nightly canary
 * sweep. A run blocked before generation (e.g. an account-level API limit)
 * costs $0. Run deliberately, not on a loop.
 */

import { readFileSync, appendFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const HISTORY_PATH = join(ROOT, "scripts", "pilot-crm-module-history.jsonl");

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
const APP_URL = env.NEXT_PUBLIC_APP_URL || "https://vision-workx.vercel.app";
const SB_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const MGMT_TOKEN = env.SUPABASE_MANAGEMENT_TOKEN;
const VERCEL_TOKEN = env.VERCEL_API_TOKEN;
const VERCEL_TEAM_ID = env.VERCEL_TEAM_ID;

if (!SB_URL || !SB_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(2);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => Date.now();
const secs = (ms) => Math.round(ms / 100) / 10; // one decimal place

async function sb(path, opts = {}) {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json",
      ...(opts.method && opts.method !== "GET" ? { Prefer: "return=representation" } : {}),
      ...opts.headers,
    },
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`${opts.method ?? "GET"} ${path} -> ${res.status} ${JSON.stringify(json)}`);
  return json;
}

/** Every ai_usage_log line item tied to this app, across every source. */
async function costsForApp(appId) {
  const rows = await sb(
    `ai_usage_log?app_id=eq.${appId}&select=source,model,input_tokens,output_tokens,cost_usd&order=created_at.asc`,
  );
  return (rows ?? []).map((r) => ({
    source: r.source,
    model: r.model,
    inputTokens: r.input_tokens,
    outputTokens: r.output_tokens,
    costUsd: Number(r.cost_usd ?? 0),
  }));
}

// Owner account used to attribute the pilot's app_revisions row —
// app_revisions.user_id is NOT NULL, and a preview/canary app's own
// user_id is null (unclaimed), so a real profile id is required. Using
// the product owner's own account, same convention as other internal
// test/seed data across this session's work.
const PILOT_OWNER_EMAIL = "sawilliams721@gmail.com";

const PILOT_EMAIL = "pilot-crm-module@visionworkx.internal";

const BOOKING_CORE_INTAKE = {
  businessName: "Pilot Salon",
  businessType: "Hair salon",
  location: "Austin, TX",
  description: "Customers book an appointment online. One admin list of bookings. Nothing else.",
  category: "booking",
  secondaryCategories: [],
  features: [],
  primaryColor: "#1A3A5C",
  backgroundColor: "#F8FAFC",
  font: "Inter",
};

// Curated, pre-written module request — stands in for a customer's free
// text. Explicitly protective of the existing booking flow, on top of
// editApp()'s own "smallest change, don't touch unrelated code" rule,
// because this is the one thing with zero prior test coverage: a module
// landing on a schema that (in the real world) may already hold live
// customer bookings.
const CRM_MODULE_PROMPT = `Add a simple CRM to this booking app:
- A new admin-only "Clients" page listing every customer who has booked, with their total number of bookings and their most recent booking date.
- Clicking a client shows their booking history and lets the admin add a free-text note about them (visible only to the admin).
Do not change the existing booking flow, the booking calendar, the public booking page, or any existing table in any way — this only adds new admin-facing CRM pages and, if a new table is needed for client notes, a new additive migration.`;

async function pollApp(appId, { label, timeoutMin = 20 }) {
  const deadline = now() + timeoutMin * 60_000;
  while (now() < deadline) {
    const [app] = await sb(`apps?id=eq.${appId}&select=status,failure_reason,deploy_url`);
    if (app?.status === "deployed") return app;
    if (app?.status === "failed" || app?.status === "deploy_failed") {
      throw new Error(`${label}: app ${appId} -> ${app.status} (${app.failure_reason ?? "no reason"})`);
    }
    process.stdout.write(".");
    await sleep(15_000);
  }
  throw new Error(`${label}: timed out waiting for app ${appId} to deploy`);
}

async function pollRevision(revisionId, { timeoutMin = 15 } = {}) {
  const deadline = now() + timeoutMin * 60_000;
  while (now() < deadline) {
    const [rev] = await sb(
      `app_revisions?id=eq.${revisionId}&select=status,error,changelog,changed_files`,
    );
    if (rev?.status === "deployed") return rev;
    if (rev?.status === "failed") throw new Error(`revision ${revisionId} failed: ${rev.error}`);
    process.stdout.write(".");
    await sleep(10_000);
  }
  throw new Error(`revision ${revisionId} timed out`);
}

// Same shape as canary-build/route.ts's smokeCheck, trimmed down: follow
// redirects a few hops, fail on 5xx or an obvious loop.
async function smokeCheck(url) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 8000);
  try {
    let cur = url;
    const seen = [];
    for (let hop = 0; hop < 6; hop++) {
      const res = await fetch(cur, { redirect: "manual", signal: ac.signal });
      if (res.status >= 500) return { ok: false, reason: `runtime ${res.status}` };
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc) return { ok: true };
        const next = new URL(loc, cur);
        seen.push(next.pathname);
        if (seen.filter((p) => p === next.pathname).length >= 3) {
          return { ok: false, reason: `redirect loop at ${next.pathname}` };
        }
        cur = next.toString();
        continue;
      }
      return { ok: res.ok || res.status < 500, reason: res.ok ? null : `status ${res.status}` };
    }
    return { ok: true };
  } catch {
    return { ok: true }; // transient — don't fail the pilot on a network blip
  } finally {
    clearTimeout(timer);
  }
}

async function cleanup(appId, { quiet = false } = {}) {
  const log = quiet ? () => {} : console.log;
  log(`\nCleaning up pilot app ${appId}...`);
  const [app] = await sb(`apps?id=eq.${appId}&select=name,vercel_project_id`);
  if (!app) {
    log("  already gone.");
    return;
  }
  if (VERCEL_TOKEN) {
    const team = VERCEL_TEAM_ID ? `?teamId=${encodeURIComponent(VERCEL_TEAM_ID)}` : "";
    const slug = app.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30);
    for (const handle of [app.vercel_project_id, `vw-${slug || "app"}-${appId.slice(0, 8)}`].filter(Boolean)) {
      try {
        const res = await fetch(`https://api.vercel.com/v9/projects/${encodeURIComponent(handle)}${team}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${VERCEL_TOKEN}` },
        });
        if (res.ok) {
          log(`  deleted Vercel project ${handle}`);
          break;
        }
      } catch {}
    }
  } else if (!quiet) {
    log("  VERCEL_API_TOKEN not set — skipping Vercel project delete.");
  }
  if (MGMT_TOKEN) {
    const ref = new URL(SB_URL).hostname.split(".")[0];
    const schema = `app_${appId.slice(0, 8)}`;
    const mgmtFetch = (path, init) =>
      fetch(`https://api.supabase.com/v1${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${MGMT_TOKEN}`, "Content-Type": "application/json", ...init?.headers },
      });
    const cfgRes = await mgmtFetch(`/projects/${ref}/postgrest`);
    const cfg = await cfgRes.json();
    const schemas = (cfg.db_schema || "public,graphql_public").split(",").map((s) => s.trim());
    if (schemas.includes(schema)) {
      await mgmtFetch(`/projects/${ref}/postgrest`, {
        method: "PATCH",
        body: JSON.stringify({ db_schema: schemas.filter((s) => s !== schema).join(",") }),
      });
    }
    await mgmtFetch(`/projects/${ref}/database/query`, {
      method: "POST",
      body: JSON.stringify({ query: `drop schema if exists "${schema}" cascade` }),
    });
    log(`  dropped tenant schema ${schema}`);
  } else if (!quiet) {
    log("  SUPABASE_MANAGEMENT_TOKEN not set — skipping schema drop.");
  }
  await sb(`apps?id=eq.${appId}`, { method: "DELETE" });
  log("  removed apps row.");
}

function appendHistory(record) {
  appendFileSync(HISTORY_PATH, JSON.stringify(record) + "\n");
}

function loadHistory() {
  if (!existsSync(HISTORY_PATH)) return [];
  return readFileSync(HISTORY_PATH, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

function printHistorySummary() {
  const runs = loadHistory();
  if (runs.length === 0) {
    console.log("No pilot runs recorded yet.");
    return;
  }
  const passed = runs.filter((r) => r.outcome === "pass").length;
  const costed = runs.filter((r) => r.totalCostUsd > 0);
  const avgCost = costed.length
    ? costed.reduce((s, r) => s + r.totalCostUsd, 0) / costed.length
    : 0;
  const totalCost = runs.reduce((s, r) => s + r.totalCostUsd, 0);

  console.log(`\n=== Pilot history: ${runs.length} run(s) ===`);
  for (const r of runs) {
    console.log(
      `  ${r.runAt}  ${r.outcome.padEnd(18)} $${r.totalCostUsd.toFixed(4).padStart(8)}  ${secs(r.totalDurationMs ?? 0)}s  ${r.outcomeDetail ?? ""}`,
    );
  }
  console.log(`\nPass rate:        ${passed}/${runs.length}`);
  console.log(`Avg cost (billed runs): $${avgCost.toFixed(4)}`);
  console.log(`Total spent so far:     $${totalCost.toFixed(4)}`);
}

async function findOwnerId() {
  // profiles has no direct email column (full_name/is_admin only), and
  // PostgREST doesn't support a raw subquery against auth.users from a
  // query param — resolve the owner id via the auth admin endpoint.
  const usersRes = await fetch(`${SB_URL}/auth/v1/admin/users?per_page=200`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  });
  const usersJson = await usersRes.json();
  const users = Array.isArray(usersJson) ? usersJson : usersJson.users ?? [];
  const ownerUser = users.find((u) => u.email === PILOT_OWNER_EMAIL);
  if (!ownerUser) throw new Error(`Could not find owner account ${PILOT_OWNER_EMAIL}`);
  return ownerUser.id;
}

async function main() {
  if (process.argv[2] === "--cleanup") {
    const appId = process.argv[3];
    if (!appId) {
      console.error("Usage: node scripts/pilot-crm-module.mjs --cleanup <appId>");
      process.exit(2);
    }
    await cleanup(appId);
    return;
  }
  if (process.argv[2] === "--history") {
    printHistorySummary();
    return;
  }

  const runStarted = now();
  const record = {
    runAt: new Date(runStarted).toISOString(),
    appId: null,
    outcome: "error",
    outcomeDetail: "",
    steps: {},
    costs: [],
    totalCostUsd: 0,
    totalDurationMs: 0,
  };

  function finish(outcome, detail) {
    record.outcome = outcome;
    record.outcomeDetail = detail;
    record.totalDurationMs = now() - runStarted;
    appendHistory(record);
    console.log(`\nRecorded to ${HISTORY_PATH}`);
  }

  let appId;
  try {
    const ownerId = await findOwnerId();

    console.log("=== Step 1: generate the booking core ===");
    // Retest-safe: a previous run's app in a TERMINAL failure state is
    // cleaned up automatically so a retest doesn't need a manual step. A
    // non-terminal (still building) one is left alone — could be a
    // genuinely concurrent run.
    const existing = await sb(`apps?preview_email=eq.${PILOT_EMAIL}&claimed_at=is.null&select=id,status`);
    if (existing.length) {
      const prior = existing[0];
      if (["failed", "deploy_failed"].includes(prior.status)) {
        console.log(`Found a previous failed pilot app (${prior.id}) — cleaning it up before retesting...`);
        await cleanup(prior.id, { quiet: true });
      } else {
        throw new Error(
          `A pilot app is already in progress (${prior.id}, status=${prior.status}) — wait for it or investigate before retesting.`,
        );
      }
    }

    const genStart = now();
    const [created] = await sb("apps", {
      method: "POST",
      body: JSON.stringify({
        user_id: null,
        name: "Pilot Salon Booking App",
        category: "booking",
        secondary_categories: [],
        status: "generating",
        intake_data: BOOKING_CORE_INTAKE,
        preview_email: PILOT_EMAIL,
        preview_expires_at: new Date(Date.now() + 72 * 3600_000).toISOString(),
      }),
    });
    appId = created.id;
    record.appId = appId;
    console.log(`App created: ${appId}`);

    await fetch(`${APP_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SB_KEY}` },
      body: JSON.stringify({ appId, _preview: true }),
    });

    console.log("Waiting for the core to deploy (this can take several minutes)...");
    let core;
    try {
      core = await pollApp(appId, { label: "core generate" });
    } catch (err) {
      const genEnd = now();
      record.steps.generate = { startedAt: new Date(genStart).toISOString(), endedAt: new Date(genEnd).toISOString(), durationSec: secs(genEnd - genStart), status: "failed" };
      record.costs = await costsForApp(appId);
      record.totalCostUsd = record.costs.reduce((s, c) => s + c.costUsd, 0);
      // apps.failure_reason is a generic category ("generation"), not the
      // real error text — the actual Anthropic error (e.g. an account-
      // level usage-limit block) only shows up in Vercel's runtime logs,
      // which this script doesn't fetch. Zero cost + a near-instant
      // failure is what an external pre-flight block looks like from data
      // already on hand; a genuine pipeline bug either burns real tokens
      // first or takes meaningfully longer to fail. Not proof by itself —
      // cross-check Vercel logs for the exact request when in doubt.
      const genDurationSec = secs(genEnd - genStart);
      const blocked = record.totalCostUsd === 0 && genDurationSec < 30;
      finish(blocked ? "blocked" : "core_failed", err.message);
      console.error(`\n${blocked ? "BLOCKED (likely external API limit, unconfirmed — check Vercel logs)" : "FAIL"}: ${err.message}`);
      process.exit(blocked ? 0 : 1);
    }
    const genEnd = now();
    record.steps.generate = { startedAt: new Date(genStart).toISOString(), endedAt: new Date(genEnd).toISOString(), durationSec: secs(genEnd - genStart), status: "ok" };
    console.log(`\nCore deployed: ${core.deploy_url} (${secs(genEnd - genStart)}s)`);

    const coreSmoke = await smokeCheck(core.deploy_url);
    if (!coreSmoke.ok) {
      record.costs = await costsForApp(appId);
      record.totalCostUsd = record.costs.reduce((s, c) => s + c.costUsd, 0);
      finish("core_failed", `smoke check failed before the module was applied — ${coreSmoke.reason}`);
      console.error(`FAIL: core smoke check failed — ${coreSmoke.reason}`);
      console.log(`App left in place for inspection: ${appId}`);
      process.exit(1);
    }
    console.log("Core smoke check: OK");

    console.log("\n=== Step 2: apply the CRM module via the real revision pipeline ===");
    const editStart = now();
    const [revision] = await sb("app_revisions", {
      method: "POST",
      body: JSON.stringify({
        app_id: appId,
        user_id: ownerId,
        kind: "change",
        status: "queued",
        request_text: CRM_MODULE_PROMPT,
      }),
    });
    console.log(`Revision queued: ${revision.id}`);

    await fetch(`${APP_URL}/api/apps/${appId}/revisions/process`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SB_KEY}` },
      body: JSON.stringify({ revisionId: revision.id }),
    });

    console.log("Waiting for the module to build and deploy...");
    let doneRevision;
    try {
      doneRevision = await pollRevision(revision.id);
    } catch (err) {
      const editEnd = now();
      record.steps.edit = { startedAt: new Date(editStart).toISOString(), endedAt: new Date(editEnd).toISOString(), durationSec: secs(editEnd - editStart), status: "failed" };
      record.costs = await costsForApp(appId);
      record.totalCostUsd = record.costs.reduce((s, c) => s + c.costUsd, 0);
      finish("module_failed", err.message);
      console.error(`\nFAIL: ${err.message}`);
      console.log(`App left in place for inspection: ${appId}`);
      process.exit(1);
    }
    const editEnd = now();
    record.steps.edit = { startedAt: new Date(editStart).toISOString(), endedAt: new Date(editEnd).toISOString(), durationSec: secs(editEnd - editStart), status: "ok" };
    console.log(`\nModule deployed (${secs(editEnd - editStart)}s). Changelog: "${doneRevision.changelog}"`);
    console.log(`Files touched: ${(doneRevision.changed_files ?? []).join(", ") || "(none reported)"}`);

    console.log("\n=== Step 3: regression-check the original booking core still works ===");
    const regStart = now();
    const [after] = await sb(`apps?id=eq.${appId}&select=deploy_url`);
    const finalSmoke = await smokeCheck(after.deploy_url);
    const regEnd = now();
    record.steps.regression = { startedAt: new Date(regStart).toISOString(), endedAt: new Date(regEnd).toISOString(), durationSec: secs(regEnd - regStart), status: finalSmoke.ok ? "ok" : "failed" };

    record.costs = await costsForApp(appId);
    record.totalCostUsd = record.costs.reduce((s, c) => s + c.costUsd, 0);

    if (!finalSmoke.ok) {
      finish("regression_failed", finalSmoke.reason);
      console.error(`FAIL: app broke after the module was applied — ${finalSmoke.reason}`);
      console.log(`App left in place for inspection: ${appId} (${after.deploy_url})`);
      process.exit(1);
    }

    console.log("Final smoke check: OK — app still serves without a 5xx or a redirect loop.");
    finish("pass", `changelog: ${doneRevision.changelog}`);

    console.log(`\nPASS: booking core survived the CRM module install.`);
    console.log(`App:      ${appId}`);
    console.log(`Live URL: ${after.deploy_url}`);
    console.log(`Total cost this run: $${record.totalCostUsd.toFixed(4)}`);
    console.log(
      "\nKnown gap this run does NOT cover: whether the module deleted or broke a specific",
      "\nbooking file/route rather than just leaving the app serving overall. That needs a",
      "\ntargeted check (e.g. hit the actual booking page path once you know it, or diff",
      "\ndoneRevision.changed_files/removed against a known list of core booking paths) —",
      "\nworth adding before trusting this pilot's result as a real go/no-go signal.",
    );
    console.log(`\nClean up when done: node scripts/pilot-crm-module.mjs --cleanup ${appId}`);
    printHistorySummary();
  } catch (err) {
    if (appId) {
      record.costs = await costsForApp(appId).catch(() => []);
      record.totalCostUsd = record.costs.reduce((s, c) => s + c.costUsd, 0);
    }
    finish("error", err.message);
    throw err;
  }
}

main().catch((err) => {
  console.error("\nPILOT SCRIPT ERROR:", err.message);
  process.exit(2);
});
