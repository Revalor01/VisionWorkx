// Safe teardown of a generated app's tenant Postgres schema.
//
// DANGER: `DROP SCHEMA "app_xxxx"` on its own leaves that name in
// PostgREST's `db_schema` exposure list (the deploy route adds every
// tenant schema to it). On PostgREST's next reload it tries to reflect a
// schema that no longer exists and the ENTIRE REST API returns 503 —
// every customer app AND the Vision Workx app go down. So the exposure
// entry MUST be removed BEFORE the schema is dropped.

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

async function mgmtQuery(sql: string): Promise<void> {
  if (!MGMT_TOKEN) return;
  await fetch(`${MGMT_BASE}/projects/${SUPABASE_REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${MGMT_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
}

/** Remove one schema from PostgREST's db_schema exposure list. No-op if absent. */
export async function unexposeSchemaInPostgREST(schema: string): Promise<void> {
  if (!MGMT_TOKEN) return;
  const res = await fetch(`${MGMT_BASE}/projects/${SUPABASE_REF}/postgrest`, {
    headers: { Authorization: `Bearer ${MGMT_TOKEN}` },
  });
  const config = await res.json();
  const current: string[] = (config.db_schema || "public,graphql_public")
    .split(",")
    .map((s: string) => s.trim())
    .filter(Boolean);
  if (!current.includes(schema)) return;
  const updated = current.filter((s) => s !== schema).join(",");
  await fetch(`${MGMT_BASE}/projects/${SUPABASE_REF}/postgrest`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${MGMT_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ db_schema: updated }),
  });
}

/**
 * Fully tear down a tenant schema: drop it from PostgREST exposure FIRST,
 * then DROP SCHEMA. Refuses anything that isn't a well-formed `app_<hex8>`
 * name so a bad id can never target a shared schema. Best-effort — logs
 * and swallows so cleanup crons don't abort a whole batch on one failure.
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
    console.error(`[tenantSchema] unexpose failed for ${schema}:`, err);
  }
  try {
    await mgmtQuery(`drop schema if exists "${schema}" cascade`);
  } catch (err) {
    console.error(`[tenantSchema] drop failed for ${schema}:`, err);
  }
}
