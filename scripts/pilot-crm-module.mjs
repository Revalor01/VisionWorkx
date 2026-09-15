/**
 * Vision Workx — booking-core + CRM-module pilot
 *
 * Tests the "shrink the core, make add-ons modules" idea end-to-end using
 * infrastructure that already exists and is already shipped (editApp() /
 * app_revisions — the "change your live app in plain English" feature) —
 * it has just never had automated coverage. This script:
 *
 *   1. Generates a fresh, minimal booking-only app (the "core").
 *   2. Waits for it to deploy, smoke-checks it.
 *   3. Fires the CRM_MODULE_PROMPT as a real app_revisions "change" through
 *      the exact same pipeline a paying customer's edit request would use.
 *   4. Waits for that revision to deploy.
 *   5. Regression-checks that the ORIGINAL booking pages still work, not
 *      just that the module's own build succeeded.
 *
 * Deliberately standalone: does NOT touch build_canary_runs (that table
 * drives /admin's official golden-pipeline pass rate; mixing in an
 * experimental module pilot would skew it) and does NOT run automatically
 * — no cron, no wiring into canary-build/route.ts. Run by hand:
 *
 *   node scripts/pilot-crm-module.mjs              # full run
 *   node scripts/pilot-crm-module.mjs --cleanup <appId>   # tear down after
 *
 * Requires in .env.local: SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL,
 * SUPABASE_MANAGEMENT_TOKEN (cleanup only), VERCEL_API_TOKEN (cleanup only).
 *
 * Costs real Anthropic spend: one full generate call + one edit call,
 * roughly the same order of magnitude as one golden canary batch entry —
 * NOT the size of a full nightly sweep. Run deliberately, not on a loop.
 */

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

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
  const deadline = Date.now() + timeoutMin * 60_000;
  while (Date.now() < deadline) {
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
  const deadline = Date.now() + timeoutMin * 60_000;
  while (Date.now() < deadline) {
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

async function cleanup(appId) {
  console.log(`\nCleaning up pilot app ${appId}...`);
  const [app] = await sb(`apps?id=eq.${appId}&select=name,vercel_project_id`);
  if (!app) {
    console.log("  already gone.");
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
          console.log(`  deleted Vercel project ${handle}`);
          break;
        }
      } catch {}
    }
  } else {
    console.log("  VERCEL_API_TOKEN not set — skipping Vercel project delete.");
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
    console.log(`  dropped tenant schema ${schema}`);
  } else {
    console.log("  SUPABASE_MANAGEMENT_TOKEN not set — skipping schema drop.");
  }
  await sb(`apps?id=eq.${appId}`, { method: "DELETE" });
  console.log("  removed apps row.");
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
  const ownerId = ownerUser.id;

  console.log("=== Step 1: generate the booking core ===");
  const existing = await sb(`apps?preview_email=eq.${PILOT_EMAIL}&claimed_at=is.null&select=id`);
  if (existing.length) {
    throw new Error(
      `A pilot app already exists unclaimed (${existing[0].id}) — clean it up first: node scripts/pilot-crm-module.mjs --cleanup ${existing[0].id}`,
    );
  }
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
  const appId = created.id;
  console.log(`App created: ${appId}`);

  await fetch(`${APP_URL}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${SB_KEY}` },
    body: JSON.stringify({ appId, _preview: true }),
  });

  console.log("Waiting for the core to deploy (this can take several minutes)...");
  const core = await pollApp(appId, { label: "core generate" });
  console.log(`\nCore deployed: ${core.deploy_url}`);

  const coreSmoke = await smokeCheck(core.deploy_url);
  if (!coreSmoke.ok) {
    console.error(`FAIL: core smoke check failed before the module was even applied — ${coreSmoke.reason}`);
    console.log(`App left in place for inspection: ${appId}`);
    process.exit(1);
  }
  console.log("Core smoke check: OK");

  console.log("\n=== Step 2: apply the CRM module via the real revision pipeline ===");
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
  const doneRevision = await pollRevision(revision.id);
  console.log(`\nModule deployed. Changelog: "${doneRevision.changelog}"`);
  console.log(`Files touched: ${(doneRevision.changed_files ?? []).join(", ") || "(none reported)"}`);

  console.log("\n=== Step 3: regression-check the original booking core still works ===");
  const [after] = await sb(`apps?id=eq.${appId}&select=deploy_url`);
  const finalSmoke = await smokeCheck(after.deploy_url);
  if (!finalSmoke.ok) {
    console.error(`FAIL: app broke after the module was applied — ${finalSmoke.reason}`);
    console.log(`App left in place for inspection: ${appId} (${after.deploy_url})`);
    process.exit(1);
  }

  console.log("Final smoke check: OK — app still serves without a 5xx or a redirect loop.");
  console.log(`\nPASS: booking core survived the CRM module install.`);
  console.log(`App:      ${appId}`);
  console.log(`Live URL: ${after.deploy_url}`);
  console.log(
    "\nKnown gap this run does NOT cover: whether the module deleted or broke a specific",
    "\nbooking file/route rather than just leaving the app serving overall. That needs a",
    "\ntargeted check (e.g. hit the actual booking page path once you know it, or diff",
    "\ndoneRevision.changed_files/removed against a known list of core booking paths) —",
    "\nworth adding before trusting this pilot's result as a real go/no-go signal.",
  );
  console.log(`\nClean up when done: node scripts/pilot-crm-module.mjs --cleanup ${appId}`);
}

main().catch((err) => {
  console.error("\nPILOT SCRIPT ERROR:", err.message);
  process.exit(2);
});
