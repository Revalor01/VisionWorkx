import { describe, expect, it } from "vitest";
import { createAccountAndSendLink, type StartAuthApi } from "./startSignIn";

// A fake Supabase with signup disabled: links only go to confirmed accounts.
function fakeAuth(existing: Record<string, { confirmed: boolean }> = {}, opts: { createFails?: boolean; confirmFails?: boolean; sendFails?: boolean } = {}) {
  const users = { ...existing };
  const calls: string[] = [];
  const api: StartAuthApi = {
    async createUser(email) {
      calls.push("create");
      if (opts.createFails) return { error: "boom" };
      if (users[email]) return { exists: true };
      users[email] = { confirmed: true }; // must be created confirmed
      return { ok: true };
    },
    async sendLink(email) {
      calls.push("send");
      if (opts.sendFails) return { error: "smtp down", code: "unexpected_failure" };
      if (!users[email]?.confirmed) return { error: "Signups not allowed", code: "signup_disabled" };
      return { ok: true };
    },
    async confirmExisting(email) {
      calls.push("confirm");
      if (opts.confirmFails || !users[email]) return false;
      users[email].confirmed = true;
      return true;
    },
  };
  return { api, users, calls };
}

describe("createAccountAndSendLink", () => {
  it("new signups get a confirmed account and a link", async () => {
    const f = fakeAuth();
    expect(await createAccountAndSendLink(f.api, "new@x.com", {})).toEqual({ ok: true });
    expect(f.users["new@x.com"].confirmed).toBe(true);
    expect(f.calls).toEqual(["create", "send"]);
  });

  it("existing confirmed accounts just get a link", async () => {
    const f = fakeAuth({ "a@x.com": { confirmed: true } });
    expect(await createAccountAndSendLink(f.api, "a@x.com", {})).toEqual({ ok: true });
    expect(f.calls).toEqual(["create", "send"]);
  });

  it("accounts stuck unconfirmed by the old flow are confirmed, then sent a link", async () => {
    const f = fakeAuth({ "stuck@x.com": { confirmed: false } });
    expect(await createAccountAndSendLink(f.api, "stuck@x.com", {})).toEqual({ ok: true });
    expect(f.calls).toEqual(["create", "send", "confirm", "send"]);
  });

  it("reports a send failure when confirming doesn't work", async () => {
    const f = fakeAuth({ "stuck@x.com": { confirmed: false } }, { confirmFails: true });
    expect(await createAccountAndSendLink(f.api, "stuck@x.com", {})).toEqual({ error: "send_failed", detail: "signup_disabled" });
  });

  it("reports create and send failures", async () => {
    expect(await createAccountAndSendLink(fakeAuth({}, { createFails: true }).api, "n@x.com", {})).toEqual({ error: "create_failed", detail: "boom" });
    expect(await createAccountAndSendLink(fakeAuth({}, { sendFails: true }).api, "n@x.com", {})).toEqual({ error: "send_failed", detail: "unexpected_failure" });
  });

  it("never confirms on other send errors", async () => {
    const f = fakeAuth({ "a@x.com": { confirmed: true } }, { sendFails: true });
    await createAccountAndSendLink(f.api, "a@x.com", {});
    expect(f.calls).not.toContain("confirm");
  });
});
