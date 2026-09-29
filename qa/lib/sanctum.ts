import { randomBytes } from "crypto";
import type { BrowserContext, Page } from "@playwright/test";

// Test data in the Sanctum web app's own Supabase project (not VisionWorkx's).
// Plain REST calls (no supabase-js) so it runs on any Node version -- the
// same approach as sanctum-web's own e2e setup.
//
// Every user is a throwaway qa+<tag>@example.com account, deleted after the
// test with everything it wrote. The global setup sweeps leftovers.

export const SANCTUM_URL = "https://sanctum-web-xi.vercel.app";
export const DISCLAIMER_KEY = "sanctum_disclaimer_accepted";
const QA_EMAIL_DOMAIN = "example.com";

/** Per-user tables that DON'T cascade when the auth user is deleted (see sanctum-web e2e teardown). */
const NON_CASCADING = ["daily_checkins", "emotional_journal", "redeem_code_attempts"];

export type SanctumTier = "free" | "plus" | "premium" | "test";

export interface SanctumUser {
  id: string;
  email: string;
  password: string;
  tier: SanctumTier;
}

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set (see docs/qa-suite.md)`);
  return v;
}

export function sanctumConfigured(): boolean {
  return !!(process.env.SANCTUM_SUPABASE_URL && process.env.SANCTUM_SUPABASE_SERVICE_ROLE_KEY);
}

async function api(path: string, init: RequestInit = {}): Promise<Response> {
  const key = env("SANCTUM_SUPABASE_SERVICE_ROLE_KEY");
  return fetch(`${env("SANCTUM_SUPABASE_URL")}${path}`, {
    ...init,
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}

async function ok(res: Response, what: string): Promise<Response> {
  if (!res.ok) throw new Error(`Sanctum ${what} failed: HTTP ${res.status} ${await res.text()}`);
  return res;
}

/** Rows from a Sanctum table (service role). `query` is a PostgREST filter string, e.g. "user_id=eq.<id>". */
export async function sanctumRows<T = Record<string, unknown>>(table: string, query: string): Promise<T[]> {
  const res = await ok(await api(`/rest/v1/${table}?${query}`), `read ${table}`);
  return (await res.json()) as T[];
}

export async function createSanctumUser(opts: { tier?: SanctumTier; onboarded?: boolean } = {}): Promise<SanctumUser> {
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
    await waitUntil(async () => (await sanctumRows("users_profile", `id=eq.${id}&select=id`)).length > 0, "the profile row");
    await ok(await api(`/rest/v1/users_profile?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ subscription_tier: tier }) }), "set tier");
    if (opts.onboarded !== false) {
      await ok(await api("/rest/v1/onboarding_state", { method: "POST", body: JSON.stringify({ user_id: id, completed: true }) }), "skip onboarding");
    }
  } catch (err) {
    await deleteSanctumUser(id);
    throw err;
  }
  return { id, email, password, tier };
}

export async function deleteSanctumUser(id: string): Promise<void> {
  for (const table of NON_CASCADING) {
    await api(`/rest/v1/${table}?user_id=eq.${id}`, { method: "DELETE" }).catch(() => undefined);
  }
  const res = await api(`/auth/v1/admin/users/${id}`, { method: "DELETE" }).catch(() => null);
  if (res && !res.ok && res.status !== 404) console.warn(`[qa] Sanctum cleanup: user ${id} not deleted: HTTP ${res.status} ${await res.text()}`);
}

/** Deletes qa+…@example.com Sanctum users older than `hours` (crashed runs). */
export async function sweepStaleSanctumUsers(hours = 3): Promise<void> {
  const cutoff = new Date(Date.now() - hours * 3600e3).toISOString();
  for (let page = 1; page <= 10; page++) {
    const res = await api(`/auth/v1/admin/users?page=${page}&per_page=200`);
    if (!res.ok) return;
    const users = ((await res.json()) as { users: { id: string; email?: string; created_at: string }[] }).users;
    for (const u of users) {
      if (u.email?.startsWith("qa+") && u.email.endsWith(`@${QA_EMAIL_DOMAIN}`) && u.created_at < cutoff) await deleteSanctumUser(u.id);
    }
    if (users.length < 200) return;
  }
}

/** Marks the "18+, not a medical service" disclaimer as accepted before any page loads. */
export async function acceptDisclaimer(context: BrowserContext): Promise<void> {
  await context.addInitScript((key) => localStorage.setItem(key, "true"), DISCLAIMER_KEY);
}

/** Logs in through the real login page. Accepts the disclaimer first unless told not to. */
export async function sanctumLogin(page: Page, user: SanctumUser, opts: { acceptDisclaimer?: boolean } = {}): Promise<void> {
  if (opts.acceptDisclaimer !== false) await acceptDisclaimer(page.context());
  await page.goto("/auth/login");
  await page.locator('input[type="email"]').fill(user.email);
  await page.locator('input[type="password"]').fill(user.password);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page.waitForURL(/\/(home|onboarding|auth\/disclaimer)/, { timeout: 20_000 });
}

/** Answers Tessa's chat endpoint with a fixed reply, so no real AI call is made. */
export async function mockTessa(page: Page, reply: { reply: string; crisis?: boolean }): Promise<void> {
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
