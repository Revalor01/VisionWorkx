import { randomBytes } from "crypto";
import type { Page } from "@playwright/test";

// Christian Friends Hub (https://christian-friends-hub.vercel.app), the Summit
// Bridge community hub. Its own Supabase project (free plan). Plain REST.
//
// READ-ONLY by decision: tests never post anything members could see
// (prayer requests, directory listings, …) and never submit volunteer
// forms (those email the real coordinators/deacons).
//
// Members are throwaway qa+<tag>@example.com accounts made directly (no
// access code needed), deleted afterwards together with their login-history
// rows, so the admin activity/log pages stay free of test sign-ins.

const QA_EMAIL_DOMAIN = "example.com";

export interface CfhMember {
  id: string;
  email: string;
  password: string;
}

function env(name: string): string {
  const v = process.env[`CFH_${name}`];
  if (!v) throw new Error(`CFH_${name} is not set (see docs/qa-suite.md)`);
  return v.replace(/[﻿\s]/g, "");
}

export function cfhConfigured(): boolean {
  return !!(process.env.CFH_SUPABASE_URL && process.env.CFH_SUPABASE_SERVICE_ROLE_KEY);
}

function api(path: string, init: RequestInit = {}) {
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  return fetch(`${env("SUPABASE_URL")}${path}`, {
    ...init,
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}

async function ok(res: Response, what: string) {
  if (!res.ok) throw new Error(`CFH ${what} failed: HTTP ${res.status} ${await res.text()}`);
  return res;
}

export async function cfhRows<T = Record<string, unknown>>(table: string, query: string): Promise<T[]> {
  const res = await ok(await api(`/rest/v1/${table}?${query}`), `read ${table}`);
  return (await res.json()) as T[];
}

export function qaEmail(): string {
  return `qa+${Date.now().toString(36)}${randomBytes(3).toString("hex")}@${QA_EMAIL_DOMAIN}`;
}

/** Removes a QA account's login-history rows (kept on user delete) and the account itself. */
export async function deleteCfhMember(idOrNull: string | null, email: string): Promise<void> {
  await api(`/rest/v1/login_history?email=eq.${encodeURIComponent(email)}`, { method: "DELETE" }).catch(() => undefined);
  if (!idOrNull) return;
  const res = await api(`/auth/v1/admin/users/${idOrNull}`, { method: "DELETE" }).catch(() => null);
  if (res && !res.ok && res.status !== 404) console.warn(`[qa] CFH cleanup: member ${email} not deleted: HTTP ${res.status} ${await res.text()}`);
}

export async function createCfhMember(opts: { blocked?: boolean } = {}): Promise<CfhMember> {
  const email = qaEmail();
  const password = `Qa!${randomBytes(18).toString("base64url")}`;
  const res = await ok(
    await api("/auth/v1/admin/users", {
      method: "POST",
      body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { full_name: "QA Automated Test", qa: true } }),
    }),
    "create member",
  );
  const id = ((await res.json()) as { id: string }).id;
  try {
    const end = Date.now() + 15_000;
    while (!(await cfhRows("profiles", `id=eq.${id}&select=id`)).length) {
      if (Date.now() > end) throw new Error("the profile row never appeared");
      await new Promise((r) => setTimeout(r, 750));
    }
    if (opts.blocked) {
      await ok(await api(`/rest/v1/profiles?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ is_blocked: true }) }), "block member");
    }
  } catch (err) {
    await deleteCfhMember(id, email);
    throw err;
  }
  return { id, email, password };
}

/** Finds a QA account by email (e.g. to prove sign-up did NOT create one). */
export async function findCfhUserByEmail(email: string): Promise<string | null> {
  for (let page = 1; page <= 10; page++) {
    const res = await api(`/auth/v1/admin/users?page=${page}&per_page=200`);
    if (!res.ok) return null;
    const users = ((await res.json()) as { users: { id: string; email?: string }[] }).users;
    const hit = users.find((u) => u.email === email);
    if (hit) return hit.id;
    if (users.length < 200) return null;
  }
  return null;
}

/** Deletes qa+…@example.com members older than `hours` (crashed runs), with their login history. */
export async function sweepStaleCfhMembers(hours = 3): Promise<void> {
  const cutoff = new Date(Date.now() - hours * 3600e3).toISOString();
  for (let page = 1; page <= 10; page++) {
    const res = await api(`/auth/v1/admin/users?page=${page}&per_page=200`);
    if (!res.ok) return;
    const users = ((await res.json()) as { users: { id: string; email?: string; created_at: string }[] }).users;
    for (const u of users) {
      if (u.email?.startsWith("qa+") && u.email.endsWith(`@${QA_EMAIL_DOMAIN}`) && u.created_at < cutoff) await deleteCfhMember(u.id, u.email);
    }
    if (users.length < 200) return;
  }
}

/** Member login through the real login page. */
export async function cfhLogin(page: Page, member: CfhMember): Promise<void> {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(member.email);
  await page.locator('input[type="password"]').fill(member.password);
  await page.getByRole("button", { name: "Log In", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20_000 });
}
