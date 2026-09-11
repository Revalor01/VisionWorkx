// Read-only baseline audit for VisionWorkx stabilization.
// Cross-references: apps rows <-> tenant app_ schemas <-> PostgREST db_schema
// exposure <-> Vercel projects. Writes NOTHING. Run:
//   node scratchpad/baseline-audit.mjs
import { readFileSync } from "fs";

const env = {};
for (const line of readFileSync("/Users/revalor-prime/vision-workx/.env.local", "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const eq = t.indexOf("=");
  if (eq === -1) continue;
  env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
}

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_REF = new URL(SUPABASE_URL).hostname.split(".")[0];
const MGMT = env.SUPABASE_MANAGEMENT_TOKEN;
const VERCEL_TOKEN = env.VERCEL_API_TOKEN;
const VERCEL_TEAM = env.VERCEL_TEAM_ID;
const MGMT_BASE = "https://api.supabase.com/v1";

async function sql(query) {
  const res = await fetch(`${MGMT_BASE}/projects/${SUPABASE_REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${MGMT}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`SQL ${res.status}: ${JSON.stringify(body).slice(0, 400)}`);
  return Array.isArray(body) ? body : [];
}

async function postgrestConfig() {
  const res = await fetch(`${MGMT_BASE}/projects/${SUPABASE_REF}/postgrest`, {
    headers: { Authorization: `Bearer ${MGMT}` },
  });
  return res.json();
}

async function vercelProjects() {
  const out = [];
  let until = "";
  for (let i = 0; i < 20; i++) {
    const u = new URL("https://api.vercel.com/v9/projects");
    if (VERCEL_TEAM) u.searchParams.set("teamId", VERCEL_TEAM);
    u.searchParams.set("limit", "100");
    if (until) u.searchParams.set("until", until);
    const res = await fetch(u, { headers: { Authorization: `Bearer ${VERCEL_TOKEN}` } });
    const body = await res.json();
    if (!res.ok) throw new Error(`Vercel ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
    out.push(...(body.projects || []));
    const next = body.pagination?.next;
    if (!next) break;
    until = String(next);
  }
  return out;
}

const line = (n = 72) => console.log("-".repeat(n));
const section = (t) => { console.log("\n" + "=".repeat(72) + "\n" + t + "\n" + "=".repeat(72)); };

// ---------------------------------------------------------------------------
const apps = await sql(`
  select id, name, category, status,
         deploy_url, vercel_project_id,
         (generated_code is null) as code_null,
         coalesce(length(generated_code), 0) as code_len,
         user_id, created_at
  from public.apps
  order by created_at
`);

const schemas = await sql(`
  select n.nspname,
         (select count(*) from pg_class c
          where c.relnamespace = n.oid and c.relkind = 'r') as table_count
  from pg_namespace n
  where n.nspname like 'app\\_%'
  order by n.nspname
`);

const pgrst = await postgrestConfig();
const exposed = String(pgrst.db_schema || "")
  .split(",").map((s) => s.trim()).filter(Boolean);
const exposedApp = exposed.filter((s) => /^app_[0-9a-f]{8}$/.test(s));

let projects = [];
let vercelErr = null;
try { projects = await vercelProjects(); } catch (e) { vercelErr = e.message; }
const vwProjects = projects.filter((p) => /^vw[-_]/i.test(p.name) || /electronics|bloom|linked|canary/i.test(p.name));

// ---------------------------------------------------------------------------
section("1. APPS ROWS  (" + apps.length + ")");
for (const a of apps) {
  console.log(
    `${a.id.slice(0, 8)}  ${String(a.category || "?").padEnd(11)} ${String(a.status || "?").padEnd(11)} ` +
    `code:${a.code_null ? "NULL".padEnd(7) : (a.code_len + "b").padEnd(7)} ` +
    `${a.vercel_project_id ? "vproj:y" : "vproj:-"}  ${a.name}`
  );
  if (a.deploy_url) console.log(`          ${a.deploy_url}`);
}

section("2. TENANT SCHEMAS  (" + schemas.length + ")");
const appPrefixes = new Set(apps.map((a) => "app_" + a.id.slice(0, 8)));
for (const s of schemas) {
  const matched = appPrefixes.has(s.nspname);
  console.log(`${s.nspname}  tables:${String(s.table_count).padStart(3)}  ${matched ? "-> has apps row" : "*** ORPHAN (no apps row) ***"}`);
}

section("3. POSTGREST db_schema EXPOSURE");
console.log("full list:", exposed.join(", "));
console.log("\napp_ entries:", exposedApp.length ? exposedApp.join(", ") : "(none)");
const schemaNames = new Set(schemas.map((s) => s.nspname));
const staleExposure = exposedApp.filter((s) => !schemaNames.has(s));
const unexposed = schemas.map((s) => s.nspname).filter((s) => !exposed.includes(s));
line();
console.log(staleExposure.length
  ? "*** STALE EXPOSURE (exposed but schema does NOT exist -> PGRST002 risk): " + staleExposure.join(", ")
  : "OK - every exposed app_ schema exists");
console.log(unexposed.length
  ? "NOTE - schemas that exist but are NOT exposed (app's REST calls will 404): " + unexposed.join(", ")
  : "OK - every tenant schema that exists is exposed");

section("4. VERCEL PROJECTS");
if (vercelErr) {
  console.log("could not list:", vercelErr);
} else {
  console.log(`total projects on team: ${projects.length}   (generated-app-looking: ${vwProjects.length})`);
  const liveProjIds = new Set(apps.map((a) => a.vercel_project_id).filter(Boolean));
  const liveHosts = new Set(
    apps.map((a) => { try { return new URL(a.deploy_url).hostname; } catch { return null; } }).filter(Boolean)
  );
  line();
  for (const p of vwProjects) {
    const byId = liveProjIds.has(p.id);
    const alias = (p.targets?.production?.alias || p.alias || []).map((x) => (typeof x === "string" ? x : x.domain));
    const byHost = alias.some((h) => liveHosts.has(h));
    const linked = byId || byHost;
    const updated = p.updatedAt ? new Date(p.updatedAt).toISOString().slice(0, 10) : "?";
    console.log(`${linked ? "  linked " : "*** DEAD"}  ${p.name.padEnd(48)} upd:${updated}  ${p.id}`);
  }
}

section("5. STUCK / BROKEN APPS ROWS");
const stuck = apps.filter((a) => a.status === "generating" || a.status === "deploying" || a.code_null || a.status === "failed");
if (!stuck.length) console.log("none");
for (const a of stuck) {
  console.log(`${a.id.slice(0, 8)}  status:${a.status}  code_null:${a.code_null}  "${a.name}"  created:${String(a.created_at).slice(0,10)}`);
}

section("SUMMARY");
const orphanSchemas = schemas.filter((s) => !appPrefixes.has(s.nspname)).map((s) => s.nspname);
const appsNoSchema = apps.filter((a) => !schemaNames.has("app_" + a.id.slice(0, 8)));
console.log(`apps rows ................. ${apps.length}`);
console.log(`tenant schemas ........... ${schemas.length}`);
console.log(`  orphan schemas ......... ${orphanSchemas.length}  ${orphanSchemas.join(", ")}`);
console.log(`  apps with NO schema .... ${appsNoSchema.length}  ${appsNoSchema.map((a) => a.id.slice(0,8) + "/" + a.status).join(", ")}`);
console.log(`stale db_schema entries .. ${staleExposure.length}  ${staleExposure.join(", ")}  ${staleExposure.length ? "<-- 503 LANDMINE, fix first" : ""}`);
console.log(`unexposed live schemas ... ${unexposed.length}  ${unexposed.join(", ")}`);
console.log(`stuck/broken apps rows ... ${stuck.length}`);
if (!vercelErr) {
  const liveProjIds = new Set(apps.map((a) => a.vercel_project_id).filter(Boolean));
  const dead = vwProjects.filter((p) => !liveProjIds.has(p.id));
  console.log(`possibly-dead vercel prj . ${dead.length}  ${dead.map((p) => p.name).join(", ")}`);
}
console.log("\n(read-only — nothing was changed)");
