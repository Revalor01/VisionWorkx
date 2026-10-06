import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dispatchIntakeFormSubmitted } from "./intakeDispatch";
import type { IntakeFormSubmittedPayload, IntakeRequestBody } from "./contract";

const payload: IntakeFormSubmittedPayload = {
  form_id: "start",
  company: "Acme Salon",
  contact_name: "Dana Owner",
  contact_email: "dana@acme.test",
  answers: [{ question: "Website", answer: "acme.test" }],
  submitted_at: "2026-10-06T00:00:00.000Z",
  page_url: "https://vision-workx.vercel.app/start",
};

function mockFetch(impl: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const fn = vi.fn(impl as unknown as typeof fetch);
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("dispatchIntakeFormSubmitted", () => {
  beforeEach(() => {
    vi.stubEnv("BOTS_INTAKE_KEY", "test-intake-key");
    vi.stubEnv("BOTS_INTAKE_URL", "https://intake.test/api/bots/intake");
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("no-ops (does not fetch) when the key is not configured", async () => {
    vi.stubEnv("BOTS_INTAKE_KEY", "");
    const fetchFn = mockFetch(() => new Response("{}", { status: 201 }));
    const res = await dispatchIntakeFormSubmitted(payload);
    expect(res).toEqual({ ok: false, reason: "not_configured" });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("sends the contract envelope with the auth header and returns the task id", async () => {
    const fetchFn = mockFetch(() => new Response(JSON.stringify({ task_id: "abc-123" }), { status: 201 }));
    const res = await dispatchIntakeFormSubmitted(payload);
    expect(res).toEqual({ ok: true, taskId: "abc-123" });

    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://intake.test/api/bots/intake");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["x-revalor-intake-key"]).toBe("test-intake-key");
    const sent = JSON.parse(init.body as string) as IntakeRequestBody;
    expect(sent.type).toBe("intake.form_submitted");
    expect(sent.source).toBe("visionworkx");
    expect(sent.payload.contact_email).toBe("dana@acme.test");
  });

  it("reports an HTTP error (e.g. 401) without throwing", async () => {
    mockFetch(() => new Response("Unauthorized", { status: 401 }));
    const res = await dispatchIntakeFormSubmitted(payload);
    expect(res).toMatchObject({ ok: false, reason: "http_error", status: 401 });
  });

  it("reports a bad 2xx response that omits task_id", async () => {
    mockFetch(() => new Response(JSON.stringify({ nope: true }), { status: 201 }));
    const res = await dispatchIntakeFormSubmitted(payload);
    expect(res).toMatchObject({ ok: false, reason: "bad_response" });
  });

  it("reports a network error without throwing", async () => {
    mockFetch(() => {
      throw new Error("ECONNREFUSED");
    });
    const res = await dispatchIntakeFormSubmitted(payload);
    expect(res).toMatchObject({ ok: false, reason: "network_error" });
  });
});
