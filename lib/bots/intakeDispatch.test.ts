import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { dispatchIntakeFormSubmitted, isTestSubmission } from "./intakeDispatch";
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
    vi.stubEnv("BOTS_INTAKE_KEY_VISIONWORKX", "test-intake-key");
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
    vi.stubEnv("BOTS_INTAKE_KEY_VISIONWORKX", "");
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

  it("retries once and succeeds after a transient failure", async () => {
    let n = 0;
    const fetchFn = mockFetch(() => {
      n += 1;
      return n === 1
        ? new Response("boom", { status: 500 })
        : new Response(JSON.stringify({ task_id: "retry-1" }), { status: 201 });
    });
    const res = await dispatchIntakeFormSubmitted(payload);
    expect(res).toEqual({ ok: true, taskId: "retry-1" });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});

// Integration test: a real local HTTP server standing in for the intake
// endpoint, so we exercise actual fetch + headers + retry, not just a mock.
describe("dispatchIntakeFormSubmitted against a local mock endpoint", () => {
  let server: Server;
  let received: { headers: Record<string, string | string[] | undefined>; body: IntakeRequestBody } | null;
  let count: number;
  let respond: (attempt: number) => { status: number; body: string };

  beforeEach(async () => {
    received = null;
    count = 0;
    respond = () => ({ status: 201, body: JSON.stringify({ task_id: "server-task-1" }) });
    server = createServer((req, res) => {
      let data = "";
      req.on("data", (c) => (data += c));
      req.on("end", () => {
        count += 1;
        received = { headers: req.headers, body: JSON.parse(data || "{}") as IntakeRequestBody };
        const r = respond(count);
        res.writeHead(r.status, { "content-type": "application/json" });
        res.end(r.body);
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const port = (server.address() as AddressInfo).port;
    vi.stubEnv("BOTS_INTAKE_KEY_VISIONWORKX", "local-key");
    vi.stubEnv("BOTS_INTAKE_URL", `http://127.0.0.1:${port}/api/bots/intake`);
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("posts the contract envelope with the auth header and gets a task id", async () => {
    const res = await dispatchIntakeFormSubmitted(payload);
    expect(res).toEqual({ ok: true, taskId: "server-task-1" });
    expect(received?.headers["x-revalor-intake-key"]).toBe("local-key");
    expect(received?.body.type).toBe("intake.form_submitted");
    expect(received?.body.source).toBe("visionworkx");
    expect(received?.body.payload.company).toBe("Acme Salon");
    expect(count).toBe(1);
  });

  it("retries once against the server and recovers from a transient 500", async () => {
    respond = (attempt) =>
      attempt === 1
        ? { status: 500, body: "nope" }
        : { status: 201, body: JSON.stringify({ task_id: "server-task-2" }) };
    const res = await dispatchIntakeFormSubmitted(payload);
    expect(res).toEqual({ ok: true, taskId: "server-task-2" });
    expect(count).toBe(2);
  });

  it("forwards is_test through to the endpoint when set", async () => {
    const res = await dispatchIntakeFormSubmitted({ ...payload, is_test: true });
    expect(res.ok).toBe(true);
    expect(received?.body.payload.is_test).toBe(true);
  });
});

describe("isTestSubmission", () => {
  it("flags reserved sandbox/QA email domains", () => {
    expect(isTestSubmission("delivered+qa@resend.dev")).toBe(true);
    expect(isTestSubmission("qa+signup@example.com")).toBe(true);
    expect(isTestSubmission("owner@qa-site.revalor.test")).toBe(true);
    expect(isTestSubmission("DANA@RESEND.DEV")).toBe(true);
  });
  it("does not flag real submitter emails", () => {
    expect(isTestSubmission("dana@acmesalon.com")).toBe(false);
    expect(isTestSubmission("owner@gmail.com")).toBe(false);
    expect(isTestSubmission("")).toBe(false);
    expect(isTestSubmission(undefined)).toBe(false);
    expect(isTestSubmission("not-an-email")).toBe(false);
  });
});
