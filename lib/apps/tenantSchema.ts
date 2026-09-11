// Safe teardown of a generated app's tenant Postgres schema.
//
// DANGER: `DROP SCHEMA "app_xxxx"` on its own leaves that name in
// PostgREST's `db_schema` exposure list (the deploy route adds every
// tenant schema to it). On PostgREST's next reload it tries to reflect a
// schema that no longer exists and the ENTIRE REST API returns 503
// (`PGRST002`) — every customer app AND the Vision Workx app go down. So
// the exposure entry MUST be removed BEFORE the schema is dropped, and if
// that removal fails we must NOT drop the schema.
//
// `reconcilePostgrestSchemas()` is the recovery path: it diffs `db_schema`
// against the schemas that actually exist and PATCHes out the strays.
// `/api/cron/db-health` runs it automatically when it sees a 503.

const MGMT_TOKEN = process.env.SUPABASE_MANAGEMENT_TOKEN;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_REF = new URL(SUPABASE_URL).hostname.split(".")[0];
const MGMT_BASE = "https://api.supabase.com/v1";

// A tenant schema is always `app_` + the first 8 chars of the app uuid.
const TENANT_SCHEMA_RE = /^app_[0-9a-f]{8}$/;
const NEVER_DROP = new Set(["public", "graphql_public", "auth", "storage", "extensions", "realtime"]);

export function tenantSchemaName(appId: string): string {
  return `app_${appId.slice(0, 8)}`;
}

class MgmtError extends Error {}

async function mgmtFetch(path: string, init?: RequestInit): Promise<Response> {
  if (!MGMT_TOKEN) throw new MgmtError("SUPABASE_MANAGEMENT_TOKEN is not set");
  const res = await fetch(`${MGMT_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${MGMT_TOKEN}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new MgmtError(`${init?.method ?? "GET"} ${path} -> ${res.status} ${(await res.text().catch(() => "")).slice(0, 300)}`);
  }
  return res;
}

/** Run SQL against the project DB (bypasses PostgREST). Throws on error. */
async function mgmtQuery(sql: string): Promise<void> {
  await mgmtFetch(`/projects/${SUPABASE_REF}/database/query`, {
    method: "POST",
    body: JSON.stringify({ query: sql }),
  });
}
async function mgmtQueryRows<T = Record<string, unknown>>(sql: string): Promise<T[]> {
  const res = await mgmtFetch(`/projects/${SUPABASE_REF}/database/query`, {
    method: "POST",
    body: JSON.stringify({ query: sql }),
  });
  const json = await res.json().catch(() => null);
  return Array.isArray(json) ? (json as T[]) : [];
}

function parseDbSchema(raw: string | undefined): string[] {
  return (raw || "public,graphql_public")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

async function getDbSchemaList(): Promise<string[]> {
  const res = await mgmtFetch(`/projects/${SUPABASE_REF}/postgrest`);
  const config = await res.json();
  return parseDbSchema(config.db_schema);
}

async function setDbSchemaList(schemas: string[]): Promise<void> {
  await mgmtFetch(`/projects/${SUPABASE_REF}/postgrest`, {
    method: "PATCH",
    body: JSON.stringify({ db_schema: schemas.join(",") }),
  });
}

/**
 * Remove one schema from PostgREST's `db_schema` exposure list.
 * Throws if the Management API is unreachable or the PATCH fails — the
 * caller must not go on to drop the schema when this throws.
 * No-op (returns) if the schema isn't currently exposed.
 */
export async function unexposeSchemaInPostgREST(schema: string): Promise<void> {
  const current = await getDbSchemaList();
  if (!current.includes(schema)) return;
  await setDbSchemaList(current.filter((s) => s !== schema));
}

/**
 * Fully tear down a tenant schema: drop it from PostgREST exposure FIRST,
 * then DROP SCHEMA. If the unexpose step fails we DO NOT drop — a leaked
 * empty schema is harmless; a dangling exposure entry 503s the whole REST
 * API. `reconcilePostgrestSchemas()` / the db-health cron clean up leaks.
 * Best-effort at its boundary: logs and swallows so a cleanup batch isn't
 * aborted by one failure.
 */
export async function removeTenantSchema(appId: string): Promise<void> {
  const schema = tenantSchemaName(appId);
  if (!TENANT_SCHEMA_RE.test(schema) || NEVER_DROP.has(schema)) {
    console.error(`[tenantSchema] refusing to drop unexpected schema name: ${schema}`);
    return;
  }
  try {
    await unexposeSchemaInPostgREST(schema);
  } catch (err) {
    console.error(
      `[tenantSchema] unexpose FAILED for ${schema} — NOT dropping the schema (a dangling db_schema entry 503s the whole REST API). It will be retried by reconcilePostgrestSchemas().`,
      err,
    );
    return;
  }
  try {
    await mgmtQuery(`drop schema if exists "${schema}" cascade`);
  } catch (err) {
    console.error(`[tenantSchema] drop failed for ${schema} (exposure already removed, safe):`, err);
  }
}

// Tables every tenant schema has that carry configuration, not customer
// records — a row here doesn't mean "this app is in use".
const NON_DATA_TABLES = new Set([
  "site_settings",
  "store_settings",
  "business_settings",
  "admin_settings",
  "settings",
]);

/** True if the tenant schema for this app id still exists in the database. */
export async function tenantSchemaExists(appId: string): Promise<boolean> {
  const schema = tenantSchemaName(appId);
  if (!TENANT_SCHEMA_RE.test(schema)) return false;
  const rows = await mgmtQueryRows<{ nspname: string }>(
    `select nspname from pg_namespace where nspname = '${schema}'`,
  );
  return rows.length > 0;
}

/**
 * Row counts for a tenant schema's *data* tables (everything except the
 * settings tables above) that currently hold at least one row. Used to decide
 * whether an app is safe to regenerate — regeneration re-runs a fresh AI
 * migration against the existing schema and can drift or drop tables.
 * Returns [] if the schema doesn't exist or the query fails.
 */
export async function tenantCustomerRowCounts(
  appId: string,
): Promise<{ table: string; rows: number }[]> {
  const schema = tenantSchemaName(appId);
  if (!TENANT_SCHEMA_RE.test(schema)) return [];
  try {
    const rows = await mgmtQueryRows<{ table_name: string; n: number }>(`
      select t.table_name,
             (xpath('/row/c/text()', query_to_xml(
               format('select count(*) c from %I.%I', t.table_schema, t.table_name),
               false, true, ''))
             )[1]::text::int as n
      from information_schema.tables t
      where t.table_schema = '${schema}' and t.table_type = 'BASE TABLE'
    `);
    return rows
      .filter((r) => !NON_DATA_TABLES.has(r.table_name) && Number(r.n) > 0)
      .map((r) => ({ table: r.table_name, rows: Number(r.n) }))
      .sort((a, b) => b.rows - a.rows);
  } catch (err) {
    console.error(`[tenantSchema] tenantCustomerRowCounts(${schema}) failed:`, err);
    return [];
  }
}

/**
 * Reconcile PostgREST's `db_schema` exposure list against reality, both ways:
 *
 *  - **remove** any `app_<hex8>` entry whose schema no longer exists — a
 *    dangling entry is a live outage (PGRST002 on every request);
 *  - **add** any `app_<hex8>` schema that exists AND has a live `public.apps`
 *    row but isn't currently exposed — that app's REST calls would 404.
 *
 * An orphan schema (exists, but no apps row — e.g. a parked legacy schema that
 * was deliberately re-exposed) is left exactly as-is: not removed, not added.
 * Safe to run any time; a no-op when already consistent. (T0.6)
 */
export async function reconcilePostgrestSchemas(): Promise<{
  removed: string[];
  added: string[];
  kept: number;
}> {
  const exposed = await getDbSchemaList();
  const schemaRows = await mgmtQueryRows<{ nspname: string }>(
    `select nspname from pg_namespace where nspname like 'app\\_%'`,
  );
  const existing = new Set(
    schemaRows.map((r) => r.nspname).filter((n) => TENANT_SCHEMA_RE.test(n)),
  );
  const appRows = await mgmtQueryRows<{ p: string }>(
    `select left(id::text, 8) as p from public.apps`,
  );
  const liveSchemas = new Set([...appRows].map((r) => `app_${r.p}`));

  const stale = exposed.filter((s) => TENANT_SCHEMA_RE.test(s) && !existing.has(s));
  const missing = [...existing].filter(
    (s) => liveSchemas.has(s) && !exposed.includes(s),
  );

  if (stale.length === 0 && missing.length === 0) {
    return { removed: [], added: [], kept: exposed.length };
  }
  const next = [...exposed.filter((s) => !stale.includes(s)), ...missing];
  await setDbSchemaList(next);
  return { removed: stale, added: missing, kept: next.length };
}
