import { randomBytes } from "crypto";
import { expect, type Page } from "@playwright/test";

// Helpers for Revalor's kids apps (Chorebit, FeelFlow, MindBit), all built on
// one template: a parent account (profiles.plan, profiles.blocked, a
// subscriptions row that must be active/trialing to use the dashboard), kids
// with optional 4-digit PINs, "kid mode" picked from /profiles, and each
// app's own kid activity tables. Plain REST (no supabase-js).
//
// Every parent is a throwaway qa+<tag>@example.com account, deleted after the
// test with its kids and everything they did. Kid tables don't cascade from
// the parent, so cleanup deletes them explicitly (children first).

export type KidsProduct = "chorebit" | "feelflow" | "mindbit";
export type KidsPlan = "free" | "family" | "family_plus";

interface KidsAppConfig {
  envPrefix: string;
  /** Tables keyed by kid_id, deleted before the kids (order matters). */
  kidTables: string[];
  /** Tables keyed by parent_id, deleted before the kids. */
  parentTables: string[];
  /** Page with the "+ Add a kid" button. */
  kidsPath: string;
}

export const KIDS_APPS: Record<KidsProduct, KidsAppConfig> = {
  chorebit: {
    envPrefix: "CHOREBIT",
    kidTables: ["points_ledger", "goals", "chore_assignments"],
    parentTables: ["chores"],
    kidsPath: "/dashboard/kids",
  },
  feelflow: { envPrefix: "FEELFLOW", kidTables: ["mood_checkins"], parentTables: [], kidsPath: "/dashboard" },
  mindbit: { envPrefix: "MINDBIT", kidTables: ["game_sessions"], parentTables: [], kidsPath: "/dashboard" },
};

export interface KidsParent {
  id: string;
  email: string;
  password: string;
}

export interface Kid {
  id: string;
  name: string;
  pin: string | null;
}

const QA_EMAIL_DOMAIN = "example.com";

export function kidsApp(product: KidsProduct) {
  const cfg = KIDS_APPS[product];
  const env = (name: string) => {
    const v = process.env[`${cfg.envPrefix}_${name}`];
    if (!v) throw new Error(`${cfg.envPrefix}_${name} is not set (see docs/qa-suite.md)`);
    return v.replace(/[﻿\s]/g, "");
  };
  const configured = () => !!(process.env[`${cfg.envPrefix}_SUPABASE_URL`] && process.env[`${cfg.envPrefix}_SUPABASE_SERVICE_ROLE_KEY`]);

  const api = (path: string, init: RequestInit = {}) => {
    const key = env("SUPABASE_SERVICE_ROLE_KEY");
    return fetch(`${env("SUPABASE_URL")}${path}`, {
      ...init,
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=representation", ...(init.headers ?? {}) },
    });
  };
  const ok = async (res: Response, what: string) => {
    if (!res.ok) throw new Error(`${product} ${what} failed: HTTP ${res.status} ${await res.text()}`);
    return res;
  };

  async function rows<T = Record<string, unknown>>(table: string, query: string): Promise<T[]> {
    const res = await ok(await api(`/rest/v1/${table}?${query}`), `read ${table}`);
    return (await res.json()) as T[];
  }

  async function waitFor<T>(fn: () => Promise<T | null | undefined | false>, what: string, timeoutMs = 15_000): Promise<T> {
    const end = Date.now() + timeoutMs;
    for (;;) {
      const v = await fn();
      if (v) return v;
      if (Date.now() > end) throw new Error(`Timed out waiting for ${what}`);
      await new Promise((r) => setTimeout(r, 750));
    }
  }

  async function deleteParent(id: string): Promise<void> {
    const del = (path: string) => api(path, { method: "DELETE" }).catch(() => undefined);
    const kids = await rows<{ id: string }>("kids", `parent_id=eq.${id}&select=id`).catch(() => []);
    if (kids.length) {
      const inList = `in.(${kids.map((k) => k.id).join(",")})`;
      for (const t of cfg.kidTables) await del(`/rest/v1/${t}?kid_id=${inList}`);
    }
    for (const t of cfg.parentTables) await del(`/rest/v1/${t}?parent_id=eq.${id}`);
    await del(`/rest/v1/kids?parent_id=eq.${id}`);
    const res = await api(`/auth/v1/admin/users/${id}`, { method: "DELETE" }).catch(() => null);
    if (res && !res.ok && res.status !== 404) console.warn(`[qa] ${product} cleanup: parent ${id} not deleted: HTTP ${res.status} ${await res.text()}`);
  }

  /**
   * A parent account. Default: Family plan with an active subscription, so the
   * dashboard opens. `subscription: null` = never subscribed (dashboard sends them
   * to /start).
   */
  async function createParent(opts: { plan?: KidsPlan; subscription?: "active" | "trialing" | null; blocked?: boolean } = {}): Promise<KidsParent> {
    const email = `qa+${Date.now().toString(36)}${randomBytes(3).toString("hex")}@${QA_EMAIL_DOMAIN}`;
    const password = `Qa!${randomBytes(18).toString("base64url")}`;
    const res = await ok(
      await api("/auth/v1/admin/users", { method: "POST", body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { qa: true } }) }),
      "create parent",
    );
    const id = ((await res.json()) as { id: string }).id;
    try {
      // profiles is created by a trigger on signup.
      await waitFor(async () => (await rows("profiles", `id=eq.${id}&select=id`)).length > 0, "the profile row");
      const plan = opts.plan ?? "family";
      await ok(
        await api(`/rest/v1/profiles?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ plan, ...(opts.blocked ? { blocked: true, block_reason: "QA test" } : {}) }) }),
        "set plan",
      );
      const sub = opts.subscription === undefined ? "active" : opts.subscription;
      if (sub) {
        await ok(await api("/rest/v1/subscriptions", { method: "POST", body: JSON.stringify({ user_id: id, status: sub, plan }) }), "add subscription");
      }
    } catch (err) {
      await deleteParent(id);
      throw err;
    }
    return { id, email, password };
  }

  /** Adds a kid directly (for tests that aren't about adding kids). */
  async function createKid(parentId: string, opts: { name?: string; pin?: string | null } = {}): Promise<Kid> {
    const name = opts.name ?? `QA Kid ${randomBytes(2).toString("hex")}`;
    const pin = opts.pin === undefined ? null : opts.pin;
    const res = await ok(await api("/rest/v1/kids", { method: "POST", body: JSON.stringify({ parent_id: parentId, name, pin, avatar_url: "🦊" }) }), "add kid");
    const [kid] = (await res.json()) as { id: string }[];
    return { id: kid.id, name, pin };
  }

  /** Deletes qa+…@example.com parents older than `hours` (crashed runs). */
  async function sweep(hours = 3): Promise<void> {
    const cutoff = new Date(Date.now() - hours * 3600e3).toISOString();
    for (let page = 1; page <= 10; page++) {
      const res = await api(`/auth/v1/admin/users?page=${page}&per_page=200`);
      if (!res.ok) return;
      const users = ((await res.json()) as { users: { id: string; email?: string; created_at: string }[] }).users;
      for (const u of users) {
        if (u.email?.startsWith("qa+") && u.email.endsWith(`@${QA_EMAIL_DOMAIN}`) && u.created_at < cutoff) await deleteParent(u.id);
      }
      if (users.length < 200) return;
    }
  }

  /** Parent login through the real login page. */
  async function login(page: Page, parent: KidsParent): Promise<void> {
    await page.goto("/login");
    await page.locator('input[name="email"]').fill(parent.email);
    await page.locator('input[name="password"]').fill(parent.password);
    await page.getByRole("button", { name: "Log in", exact: true }).click();
    await page.waitForURL(/\/(dashboard|start|account-blocked|admin)/, { timeout: 20_000 });
  }

  /** Picks a kid on /profiles (entering the PIN if it has one) and lands in kid mode. */
  async function enterKidMode(page: Page, kid: Kid, pin: string | null = kid.pin): Promise<void> {
    await page.goto("/profiles");
    await page.getByRole("button", { name: kid.name }).click();
    if (kid.pin) {
      await page.getByPlaceholder("PIN").fill(pin ?? "");
      await page.getByRole("button", { name: "Go" }).click();
    }
    if (pin === kid.pin) await page.waitForURL(/\/kid/, { timeout: 20_000 });
  }

  return { product, cfg, configured, rows, waitFor, createParent, createKid, deleteParent, sweep, login, enterKidMode };
}

export type KidsApp = ReturnType<typeof kidsApp>;

/** The kids product a test is running for, from its Playwright project ("chorebit", "chorebit-mobile", …). */
export function kidsProductOf(projectName: string): KidsProduct {
  const p = projectName.replace(/-mobile$/, "");
  if (p !== "chorebit" && p !== "feelflow" && p !== "mindbit") throw new Error(`${projectName} isn't a kids-app project`);
  return p;
}

export { expect };
