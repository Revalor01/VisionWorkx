import { randomBytes } from "crypto";
import type { BrowserContext, Page } from "@playwright/test";

// Helpers for Revalor's consumer web apps built from the shared template
// (Sanctum, Proactive, …): each has its own Supabase project, tiers on
// users_profile.subscription_tier, an onboarding_state row, a localStorage
// disclaimer flag and a password login page. Plain REST calls (no
// supabase-js) so they run on any Node version.
//
// Every user is a throwaway qa+<tag>@example.com account, deleted after the
// test with everything it wrote. The global setup sweeps leftovers.

export type Tier = "free" | "plus" | "premium" | "test";

export interface AppUser {
  id: string;
  email: string;
  password: string;
  tier: Tier;
}

const QA_EMAIL_DOMAIN = "example.com";

export interface TemplateApp {
  /** e.g. "SANCTUM" -> SANCTUM_SUPABASE_URL / SANCTUM_SUPABASE_SERVICE_ROLE_KEY */
  envPrefix: string;
  disclaimerKey: string;
  /** Per-user tables that DON'T cascade when the auth user is deleted. */
  nonCascading: string[];
}

export function templateApp(app: TemplateApp) {
  const env = (name: string): string => {
    const v = process.env[`${app.envPrefix}_${name}`];
    if (!v) throw new Error(`${app.envPrefix}_${name} is not set (see docs/qa-suite.md)`);
    return v;
  };

  const configured = () => !!(process.env[`${app.envPrefix}_SUPABASE_URL`] && process.env[`${app.envPrefix}_SUPABASE_SERVICE_ROLE_KEY`]);

  const api = (path: string, init: RequestInit = {}) => {
    const key = env("SUPABASE_SERVICE_ROLE_KEY");
    return fetch(`${env("SUPABASE_URL")}${path}`, {
      ...init,
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    });
  };

  const ok = async (res: Response, what: string) => {
    if (!res.ok) throw new Error(`${app.envPrefix} ${what} failed: HTTP ${res.status} ${await res.text()}`);
    return res;
  };

  /** Rows from a table (service role). `query` is a PostgREST filter string, e.g. "user_id=eq.<id>". */
  async function rows<T = Record<string, unknown>>(table: string, query: string): Promise<T[]> {
    const res = await ok(await api(`/rest/v1/${table}?${query}`), `read ${table}`);
    return (await res.json()) as T[];
  }

  async function deleteUser(id: string): Promise<void> {
    for (const table of app.nonCascading) {
      await api(`/rest/v1/${table}?user_id=eq.${id}`, { method: "DELETE" }).catch(() => undefined);
    }
    const res = await api(`/auth/v1/admin/users/${id}`, { method: "DELETE" }).catch(() => null);
    if (res && !res.ok && res.status !== 404) console.warn(`[qa] ${app.envPrefix} cleanup: user ${id} not deleted: HTTP ${res.status} ${await res.text()}`);
  }

  async function createUser(opts: { tier?: Tier; onboarded?: boolean } = {}): Promise<AppUser> {
    const tier = opts.tier ?? "free";
    const email = `qa+${Date.now().toString(36)}${randomBytes(3).toString("hex")}@${QA_EMAIL_DOMAIN}`;
    const password = `Qa!${randomBytes(18).toString("base64url")}`;
    const res = await ok(
      await api("/auth/v1/admin/users", { method: "POST", body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { qa: true } }) }),
      "create user",
    );
    const id = ((await res.json()) as { id: string }).id;
    try {
      // users_profile is created by a trigger on signup; set the tier on it.
      await waitUntil(async () => (await rows("users_profile", `id=eq.${id}&select=id`)).length > 0, "the profile row");
      await ok(await api(`/rest/v1/users_profile?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ subscription_tier: tier }) }), "set tier");
      if (opts.onboarded !== false) {
        await ok(await api("/rest/v1/onboarding_state", { method: "POST", body: JSON.stringify({ user_id: id, completed: true }) }), "skip onboarding");
      }
    } catch (err) {
      await deleteUser(id);
      throw err;
    }
    return { id, email, password, tier };
  }

  /** Deletes qa+…@example.com users older than `hours` (crashed runs). */
  async function sweep(hours = 3): Promise<void> {
    const cutoff = new Date(Date.now() - hours * 3600e3).toISOString();
    for (let page = 1; page <= 10; page++) {
      const res = await api(`/auth/v1/admin/users?page=${page}&per_page=200`);
      if (!res.ok) return;
      const users = ((await res.json()) as { users: { id: string; email?: string; created_at: string }[] }).users;
      for (const u of users) {
        if (u.email?.startsWith("qa+") && u.email.endsWith(`@${QA_EMAIL_DOMAIN}`) && u.created_at < cutoff) await deleteUser(u.id);
      }
      if (users.length < 200) return;
    }
  }

  /** Marks the "18+, not a professional service" disclaimer as accepted before any page loads. */
  async function acceptDisclaimer(context: BrowserContext): Promise<void> {
    await context.addInitScript((key) => localStorage.setItem(key, "true"), app.disclaimerKey);
  }

  /** Logs in through the real login page. Accepts the disclaimer first unless told not to. */
  async function login(page: Page, user: AppUser, opts: { acceptDisclaimer?: boolean } = {}): Promise<void> {
    if (opts.acceptDisclaimer !== false) await acceptDisclaimer(page.context());
    await page.goto("/auth/login");
    await page.locator('input[type="email"]').fill(user.email);
    await page.locator('input[type="password"]').fill(user.password);
    await page.getByRole("button", { name: "Log in", exact: true }).click();
    await page.waitForURL(/\/(home|onboarding|auth\/disclaimer)/, { timeout: 20_000 });
  }

  return { configured, rows, createUser, deleteUser, sweep, acceptDisclaimer, login, disclaimerKey: app.disclaimerKey };
}

/** Answers the app's AI chat endpoint (Supabase function "chat") with a fixed reply, so no real AI call is made. */
export async function mockChat(page: Page, reply: { reply: string; crisis?: boolean }): Promise<void> {
  await page.route("**/functions/v1/chat", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ crisis: false, ...reply }) }),
  );
}

export async function waitUntil(fn: () => Promise<boolean>, what: string, timeoutMs = 15_000): Promise<void> {
  const end = Date.now() + timeoutMs;
  while (!(await fn())) {
    if (Date.now() > end) throw new Error(`Timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 750));
  }
}
