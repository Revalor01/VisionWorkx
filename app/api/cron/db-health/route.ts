import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { notifyBuildFailure } from "@/lib/apps/operatorAlert";
import { reconcilePostgrestSchemas } from "@/lib/apps/tenantSchema";

export const runtime = "nodejs";
export const maxDuration = 60;

// Cheap probe of the project's PostgREST API. A dangling `app_<hex8>` entry
// in `db_schema` (a tenant schema dropped without unexposing it first)
// makes PostgREST fail its schema-cache build and 503 EVERY request —
// every generated app and the Vision Workx app go down at once, silently.
// This runs every ~10 min: on a schema-cache 503 it self-heals via
// reconcilePostgrestSchemas() and alerts the operator on any state change.
const KEY = "supabase_rest";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function probe(): Promise<{ ok: boolean; status: number; schemaCache: boolean; detail: string }> {
  try {
    // A real table read — the `/rest/v1/` root only answers to the
    // service_role key. A schema-cache failure is global, so `apps` 503s
    // just like every tenant table would.
    const res = await fetch(`${SUPABASE_URL}/rest/v1/apps?select=id&limit=1`, {
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
    });
    if (res.ok) return { ok: true, status: res.status, schemaCache: false, detail: "ok" };
    const body = (await res.text().catch(() => "")).slice(0, 300);
    return {
      ok: false,
      status: res.status,
      schemaCache: /PGRST002|schema cache/i.test(body),
      detail: `${res.status} ${body}`,
    };
  } catch (err) {
    return { ok: false, status: 0, schemaCache: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

export async function GET(req: NextRequest) {
  if ((req.headers.get("authorization") ?? "") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const service = createServiceClient();

  let p = await probe();
  let remediation: { removed: string[]; kept: number } | null = null;
  let remediationError: string | null = null;

  if (!p.ok && p.schemaCache) {
    try {
      remediation = await reconcilePostgrestSchemas();
      if (remediation.removed.length > 0) {
        await sleep(15000); // PostgREST reload
        p = await probe();
      }
    } catch (err) {
      remediationError = err instanceof Error ? err.message : String(err);
    }
  }

  const ok = p.ok;
  const { data: prev } = await service.from("system_health").select("ok").eq("key", KEY).maybeSingle();
  const wasOk = prev?.ok ?? true;

  const detail = [
    p.detail,
    remediation?.removed.length ? `auto-removed stale db_schema entries: ${remediation.removed.join(", ")}` : "",
    remediationError ? `remediation error: ${remediationError}` : "",
  ]
    .filter(Boolean)
    .join(" | ");

  await service
    .from("system_health")
    .upsert({ key: KEY, ok, detail: detail.slice(0, 500), updated_at: new Date().toISOString() });

  if (!ok && (wasOk || remediation?.removed.length || remediationError)) {
    await notifyBuildFailure({
      stage: "health",
      appId: "-",
      appName: "Supabase REST API health check",
      customer: null,
      error: detail,
      title:
        p.schemaCache
          ? "🔴 Supabase REST API DOWN (schema-cache / PGRST002) — every app is 503ing"
          : "🔴 Supabase REST API health check FAILING",
    });
  } else if (!wasOk && ok) {
    await notifyBuildFailure({
      stage: "health",
      appId: "-",
      appName: "Supabase REST API health check",
      customer: null,
      error:
        (remediation?.removed.length
          ? `Auto-healed: removed stale db_schema entries (${remediation.removed.join(", ")}). `
          : "") + "The REST API is responding again.",
      title: "✅ Supabase REST API RECOVERED",
    });
  }

  return NextResponse.json({
    ok,
    changed: wasOk !== ok,
    status: p.status,
    schemaCache: p.schemaCache,
    removed: remediation?.removed ?? [],
    remediationError,
  });
}
