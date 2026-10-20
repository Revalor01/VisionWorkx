import { afterEach, describe, expect, it, vi } from "vitest";
import {
  tenantAccessHardeningSql,
  tenantAdminFunctionSql,
  tenantAdminPolicySql,
  tenantSchemaExists,
} from "./tenantSchema";

// Regression cases for the canary-teardown incident found on /admin
// (2026-09-11): a single transient Management API blip (429/5xx/network)
// during the back-to-back teardown of all 5 golden canaries made
// unexposeSchemaInPostgREST() throw, which correctly left the stale
// preview app row in place for retry — which then collided with
// apps_preview_email_unclaimed_idx the moment the same cron invocation
// tried to fire a fresh build under that email. mgmtFetch() (private to
// this module) now retries transient failures instead of surfacing them
// on the first blip; tenantSchemaExists() is the simplest exported path
// that exercises it.

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("mgmtFetch retry (via tenantSchemaExists)", () => {
  it("recovers from transient 503s instead of failing on the first one", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("temporarily unavailable", { status: 503 }))
      .mockResolvedValueOnce(new Response("temporarily unavailable", { status: 503 }))
      .mockResolvedValueOnce(jsonResponse([{ nspname: "app_deadbeef" }]));
    vi.stubGlobal("fetch", fetchMock);

    const exists = await tenantSchemaExists("deadbeef-0000-0000-0000-000000000000");

    expect(exists).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("recovers from a network-level throw (not just a bad status)", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(jsonResponse([]));
    vi.stubGlobal("fetch", fetchMock);

    const exists = await tenantSchemaExists("deadbeef-0000-0000-0000-000000000000");

    expect(exists).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry a non-retryable status (fails fast on real auth/config errors)", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response("nope", { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      tenantSchemaExists("deadbeef-0000-0000-0000-000000000000"),
    ).rejects.toThrow(/401/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("gives up after exhausting retries on a persistent 503", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response("down", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      tenantSchemaExists("deadbeef-0000-0000-0000-000000000000"),
    ).rejects.toThrow(/503/);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe("tenantAccessHardeningSql", () => {
  it("grants service_role read-only access and makes every view security_invoker", () => {
    const sql = tenantAccessHardeningSql("app_deadbeef");
    expect(sql).toContain('GRANT USAGE ON SCHEMA "app_deadbeef" TO service_role;');
    expect(sql).toContain('GRANT SELECT ON ALL TABLES IN SCHEMA "app_deadbeef" TO service_role;');
    expect(sql).toContain("SET (security_invoker = true)");
    expect(sql).toContain("n.nspname = 'app_deadbeef' AND c.relkind = 'v'");
    expect(sql).not.toMatch(/GRANT\s+(INSERT|UPDATE|DELETE|ALL)/i);
  });

  it("refuses anything that isn't a tenant schema name", () => {
    for (const bad of ["public", "auth", "app_DEADBEEF", "app_deadbeef'; drop table x; --"]) {
      expect(() => tenantAccessHardeningSql(bad)).toThrow(/refusing/);
    }
  });
});

describe("tenantAdminFunctionSql", () => {
  const APP = "ef6ca6a6-1234-4abc-8def-0123456789ab";

  it("checks ownership by user id against public.apps, as SECURITY DEFINER with an empty search_path", () => {
    const sql = tenantAdminFunctionSql("app_ef6ca6a6", APP);
    expect(sql).toContain('CREATE OR REPLACE FUNCTION "app_ef6ca6a6".is_app_admin() RETURNS boolean');
    expect(sql).toContain("SECURITY DEFINER SET search_path = ''");
    expect(sql).toContain(`public.apps WHERE id = '${APP}'::uuid AND user_id = auth.uid()`);
    expect(sql).not.toMatch(/email/i);
  });

  it("also builds the dry-run copy, and refuses bad schema names or app ids", () => {
    expect(() => tenantAdminFunctionSql("zz_dryrun_0123456789ab", APP)).not.toThrow();
    expect(() => tenantAdminFunctionSql("public", APP)).toThrow(/refusing/);
    expect(() => tenantAdminFunctionSql("app_ef6ca6a6", "x'; drop table apps; --")).toThrow(/refusing/);
  });
});

describe("tenantAdminPolicySql", () => {
  it("rewrites any-signed-in and open write policies to is_app_admin(), sparing public inserts/catalogs", () => {
    const sql = tenantAdminPolicySql("app_deadbeef");
    expect(sql).toContain("format('%I.is_app_admin()', 'app_deadbeef')");
    expect(sql).toContain("schemaname = 'app_deadbeef' AND tablename <> 'site_settings'");
    expect(sql).toContain("auth\\.role\\(\\) = ''authenticated''::text");
    expect(sql).toContain("auth\\.uid\\(\\) IS NOT NULL");
    // INSERT `true` (public forms) and SELECT `true` (catalogs) are not in the `true` branches
    expect(sql).toContain("p.qual = 'true' AND (p.cmd IN ('UPDATE', 'DELETE')");
    expect(sql).toContain("p.cmd <> 'INSERT'");
  });

  it("refuses anything that isn't a tenant schema name", () => {
    expect(() => tenantAdminPolicySql("public")).toThrow(/refusing/);
  });
});
