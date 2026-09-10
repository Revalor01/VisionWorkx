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

/**
 * Self-heal PostgREST's `db_schema`: any `app_<hex8>` entry that no longer
 * exists as a real schema is a live outage (PGRST002 on every request).
 * Diff the exposure list against `pg_namespace` and PATCH out the strays.
 * Returns the names it removed. Safe to run any time; a no-op when clean.
 */
export async function reconcilePostgrestSchemas(): Promise<{ removed: string[]; kept: number }> {
  const exposed = await getDbSchemaList();
  const rows = await mgmtQueryRows<{ nspname: string }>(
    `select nspname from pg_namespace where nspname like 'app\\_%'`,
  );
  const existing = new Set(rows.map((r) => r.nspname));
  const stale = exposed.filter((s) => TENANT_SCHEMA_RE.test(s) && !existing.has(s));
  if (stale.length === 0) return { removed: [], kept: exposed.length };
  await setDbSchemaList(exposed.filter((s) => !stale.includes(s)));
  return { removed: stale, kept: exposed.length - stale.length };
}
