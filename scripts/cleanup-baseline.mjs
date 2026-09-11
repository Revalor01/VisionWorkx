// Step 0 of docs/stabilization-plan.md — bring the platform to a known-good zero.
//
// Deletes ONLY the explicit debris list below (canary leftovers + orphaned
// projects from already-deleted apps + one zombie apps row). It will NOT touch
// anything in KEEP_SCHEMAS, and it hard-aborts if a target schema turns out to
// hold real rows.
//
//   node scripts/cleanup-baseline.mjs            # dry run (default) — prints the plan
//   node scripts/cleanup-baseline.mjs --apply    # actually delete
//
// Procedure per the plan: unexpose every target schema from PostgREST's
// db_schema in ONE patch, GET the config back and assert they're gone, and only
// THEN DROP. Never drop before the exposure removal is confirmed — a dangling
// db_schema entry 503s the entire REST API (PGRST002).

import { readFileSync } from "fs";

const APPLY = process.argv.includes("--apply");

// --- config -----------------------------------------------------------------
const env = {};
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const eq = t.indexOf("=");
  if (eq === -1) continue;
  env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
}
const SUPABASE_REF = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
const MGMT = env.SUPABASE_MANAGEMENT_TOKEN;
const VERCEL_TOKEN = env.VERCEL_API_TOKEN;
const VERCEL_TEAM = env.VERCEL_TEAM_ID;
const MGMT_BASE = "https://api.supabase.com/v1";
if (!MGMT) throw new Error("SUPABASE_MANAGEMENT_TOKEN missing");
if (!VERCEL_TOKEN) throw new Error("VERCEL_API_TOKEN missing");

// --- the explicit target list (from scripts/baseline-audit.mjs, 2026-09-10) --

// Tenant schemas to drop, each with its paired dead Vercel project.
// `seed: true` = verified 2026-09-10 to contain only canary demo fixtures
//   (fake names, (512) 555-01xx phones, @example.com / @email.com emails, all
//   rows bulk-inserted during the canary window; project name is vw-canary-*;
//   no apps row). The real-data guard is waived for these — but it still
//   hard-blocks any target WITHOUT this flag.
const SCHEMA_TARGETS = [
  { schema: "app_08d38616", project: "prj_drBByhHwCXHJyT03GNWjcxPJAcaX", label: "canary: candles online-store", seed: true },
  { schema: "app_dea458d3", project: "prj_RUrHel7XZvbCtd4NgBLaAaQlwEaD", label: "canary: candles online-store", seed: true },
  { schema: "app_d2ea49ad", project: "prj_DQxPA1Kpex0RdlU59IKVMRbeg3of", label: "canary: law portal", seed: true },
  { schema: "app_4220e1d9", project: "prj_yt6ZT9ThezgGSKcpiE0crMyvvts3", label: "canary: law portal", seed: true },
  { schema: "app_d388255e", project: "prj_2YZcU1jtLmMC67GbNMqCiGz3Z3Qq", label: "canary: plumbing invoicing", seed: true },
  { schema: "app_35694168", project: "prj_UTn4KGBGtIAbCN53GK2rGOIFanNS", label: "canary: plumbing invoicing", seed: true },
  { schema: "app_23e6a567", project: "prj_ytUTL6NzbhWrKNNYN8CgBsFgCf2n", label: "canary: salon booking", seed: true },
  { schema: "app_f2ccaf2e", project: "prj_yZDuS56seyXhaSn5jJ3wgiKdOimD", label: "canary: salon booking", seed: true },
  { schema: "app_b68d6436", project: "prj_hAZ4mWYwS9EEpw6sT5oIWZKITMvd", label: "canary: coffee booking", seed: true },
  { schema: "app_6b6b8552", project: "prj_6GVwKxZVUKZRewUkqd1MKD07uRIX", label: "canary: coffee booking", seed: true },
  { schema: "app_d286e89f", project: "prj_rR8Tg7fySU83kzNhfLvvFckiDrI6", label: "abandoned Linked Legacy regen (empty)" },
];

// Dead Vercel projects whose schema/row is already gone (deleted apps).
const PROJECT_ONLY_TARGETS = [
  { project: "prj_XuRfeujHjRdD7qCdMOSxkS6foUm0", name: "vw-electronics-r-us-online-store-bdabac43", label: "deleted app — orphaned project" },
  { project: "prj_6gE62IBu0Ll1nBT0JthXoSa5Zs7G", name: "vw-bloom-yoga-studio-booking-app-a6a94c35", label: "deleted app — orphaned project" },
];

// Zombie apps row: no tenant schema, no Vercel project, deploy_url 404s.
const APPS_ROW_TARGET = { idPrefix: "a726f49a", nameMustContain: "Canary Law" };

// Guardrail: these must never be dropped, whatever else happens.
const KEEP_SCHEMAS = new Set([
  "app_741aa936", "app_e5fcbdd6", "app_c0640777", "app_a8f2042a", // healthy legacy
  "app_3f6587bd", "app_ef6ca6a6",                                  // Linked Legacy (parked)
]);

// Tables that legitimately carry a seed row in an otherwise-empty schema.
const BENIGN_TABLES = new Set([
  "site_settings", "admin_settings", "business_settings", "store_settings", "settings",
]);

// --- helpers --------------------------------------------------------------
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
async function getPostgrest() {
  const res = await fetch(`${MGMT_BASE}/projects/${SUPABASE_REF}/postgrest`, {
    headers: { Authorization: `Bearer ${MGMT}` },
  });
  if (!res.ok) throw new Error(`GET postgrest ${res.status}`);
  return res.json();
}
async function setDbSchema(list) {
  const res = await fetch(`${MGMT_BASE}/projects/${SUPABASE_REF}/postgrest`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${MGMT}`, "Content-Type": "application/json" },
    body: JSON.stringify({ db_schema: list.join(",") }),
  });
  if (!res.ok) throw new Error(`PATCH postgrest ${res.status}: ${(await res.text()).slice(0, 300)}`);
}
async function deleteVercelProject(id) {
  const u = new URL(`https://api.vercel.com/v9/projects/${encodeURIComponent(id)}`);
  if (VERCEL_TEAM) u.searchParams.set("teamId", VERCEL_TEAM);
  const res = await fetch(u, { method: "DELETE", headers: { Authorization: `Bearer ${VERCEL_TOKEN}` } });
  if (res.ok || res.status === 204) return "deleted";
  if (res.status === 404) return "already gone";
  return `FAILED ${res.status} ${(await res.text().catch(() => "")).slice(0, 160)}`;
}
const parseList = (raw) => String(raw || "public,graphql_public").split(",").map((s) => s.trim()).filter(Boolean);
const die = (msg) => { console.error("\n*** ABORT: " + msg + "\n"); process.exit(1); };
const H = (t) => console.log("\n" + "=".repeat(72) + "\n" + t + "\n" + "=".repeat(72));

// --- 0. sanity -----------------------------------------------------------
for (const { schema } of SCHEMA_TARGETS) {
  if (KEEP_SCHEMAS.has(schema)) die(`target ${schema} is in KEEP_SCHEMAS — refusing`);
}

console.log(`\nMODE: ${APPLY ? "APPLY (will delete)" : "DRY RUN (no changes)"}`);
console.log(`Supabase project: ${SUPABASE_REF}\n`);

// --- 1. inspect each target schema -------------------------------------
H("1. TARGET TENANT SCHEMAS  (" + SCHEMA_TARGETS.length + ")");

const existing = new Set(
  (await sql(`select nspname from pg_namespace where nspname like 'app\\_%'`)).map((r) => r.nspname),
);
const pgrst = await getPostgrest();
const exposed = parseList(pgrst.db_schema);

let blocked = false;
for (const t of SCHEMA_TARGETS) {
  const isThere = existing.has(t.schema);
  const isExposed = exposed.includes(t.schema);
  console.log(`\n${t.schema}  — ${t.label}`);
  console.log(`  schema exists: ${isThere ? "yes" : "no (already dropped)"}   exposed in db_schema: ${isExposed ? "YES (needs unexpose first)" : "no"}`);
  if (!isThere) continue;

  const rows = await sql(`
    select t.table_name,
           (xpath('/row/c/text()', query_to_xml(
             format('select count(*) c from %I.%I', t.table_schema, t.table_name),
             false, true, ''))
           )[1]::text::int as n
    from information_schema.tables t
    where t.table_schema = '${t.schema}' and t.table_type = 'BASE TABLE'
    order by t.table_name`);
  const nonEmpty = rows.filter((r) => r.n > 0);
  console.log(`  tables: ${rows.length}   ` + (nonEmpty.length
    ? "rows in: " + nonEmpty.map((r) => `${r.table_name}=${r.n}`).join(", ")
    : "all empty"));

  const realData = nonEmpty.filter((r) => !BENIGN_TABLES.has(r.table_name));
  if (realData.length && t.seed) {
    console.log(`  seed data (waived by seed:true — will be destroyed): ${realData.map((r) => `${r.table_name}=${r.n}`).join(", ")}`);
  } else if (realData.length) {
    console.log(`  *** HOLDS REAL DATA: ${realData.map((r) => `${r.table_name}=${r.n}`).join(", ")}`);
    blocked = true;
  }
}
if (blocked) {
  die("one or more target schemas hold real rows (not just seed settings). Re-review the target list in this file before proceeding.");
}

// --- 2. project-only targets ------------------------------------------
H("2. ORPHANED VERCEL PROJECTS (schema/row already gone)  (" + PROJECT_ONLY_TARGETS.length + ")");
for (const p of PROJECT_ONLY_TARGETS) console.log(`  ${p.project}  ${p.name}  — ${p.label}`);

// --- 3. zombie apps row --------------------------------------------------
H("3. ZOMBIE apps ROW");
const zrows = await sql(`select id, name, status from public.apps where id::text like '${APPS_ROW_TARGET.idPrefix}%'`);
let zombie = null;
if (zrows.length === 0) {
  console.log("  no row matching " + APPS_ROW_TARGET.idPrefix + "* — nothing to do");
} else if (zrows.length > 1) {
  die(`${zrows.length} apps rows match ${APPS_ROW_TARGET.idPrefix}* — expected exactly 1`);
} else {
  zombie = zrows[0];
  const schemaName = "app_" + zombie.id.slice(0, 8);
  const hasSchema = existing.has(schemaName);
  console.log(`  ${zombie.id}  "${zombie.name}"  status=${zombie.status}`);
  console.log(`  tenant schema ${schemaName} exists: ${hasSchema ? "YES" : "no"}`);
  if (!zombie.name.includes(APPS_ROW_TARGET.nameMustContain)) die(`row name "${zombie.name}" doesn't contain "${APPS_ROW_TARGET.nameMustContain}"`);
  if (hasSchema) die(`row ${zombie.id} still has a tenant schema — not a zombie, refusing to delete`);
}

// --- 4. plan / execute -----------------------------------------------
const toUnexpose = SCHEMA_TARGETS.map((t) => t.schema).filter((s) => exposed.includes(s));
const toDrop = SCHEMA_TARGETS.map((t) => t.schema).filter((s) => existing.has(s));
const allProjects = [
  ...SCHEMA_TARGETS.map((t) => ({ id: t.project, label: t.schema + " / " + t.label })),
  ...PROJECT_ONLY_TARGETS.map((p) => ({ id: p.project, label: p.name + " / " + p.label })),
];

H("PLAN");
console.log(`unexpose from db_schema (1 PATCH): ${toUnexpose.length ? toUnexpose.join(", ") : "(none)"}`);
console.log(`DROP SCHEMA ... CASCADE:           ${toDrop.length}  [${toDrop.join(", ")}]`);
console.log(`DELETE Vercel projects:            ${allProjects.length}`);
console.log(`DELETE apps row:                   ${zombie ? zombie.id : "(none)"}`);

if (!APPLY) {
  console.log("\nDry run only. Re-run with --apply to execute.\n");
  process.exit(0);
}

// ---- APPLY ----
H("APPLYING");

// 4a. unexpose (single patch), then verify
if (toUnexpose.length) {
  const next = exposed.filter((s) => !toUnexpose.includes(s));
  console.log(`PATCH db_schema -> removing ${toUnexpose.length} entries ...`);
  await setDbSchema(next);
  const after = parseList((await getPostgrest()).db_schema);
  const stillThere = toUnexpose.filter((s) => after.includes(s));
  if (stillThere.length) die(`db_schema PATCH did not take — still exposed: ${stillThere.join(", ")}. NOT dropping anything.`);
  console.log("  verified: all target schemas removed from db_schema.");
} else {
  console.log("nothing to unexpose.");
}

// 4b. drop schemas
for (const s of toDrop) {
  process.stdout.write(`DROP SCHEMA "${s}" CASCADE ... `);
  await sql(`drop schema if exists "${s}" cascade`);
  console.log("ok");
}

// 4c. delete Vercel projects
for (const p of allProjects) {
  process.stdout.write(`DELETE vercel ${p.id} (${p.label}) ... `);
  console.log(await deleteVercelProject(p.id));
}

// 4d. delete zombie row
if (zombie) {
  process.stdout.write(`DELETE apps row ${zombie.id} ... `);
  await sql(`delete from public.apps where id = '${zombie.id}'`);
  console.log("ok");
}

H("DONE — now re-run: node scripts/baseline-audit.mjs");
