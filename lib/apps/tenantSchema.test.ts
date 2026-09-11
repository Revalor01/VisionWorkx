import { afterEach, describe, expect, it, vi } from "vitest";
import { tenantSchemaExists } from "./tenantSchema";

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
