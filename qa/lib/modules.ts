import { randomBytes } from "crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import type { BrowserContext, Page } from "@playwright/test";
import { MODULES_AUTH_COOKIE } from "../../lib/modules/constants";

// Test data in the VisionWorkx MODULES database. Everything created here is
// tagged is_test (and comped, so no Stripe) and deleted afterwards; the
// global setup also sweeps anything a crashed run left behind.

/** Fake customer site the embed runs on. Requests to it are answered by Playwright, never DNS. */
export const QA_HOST = "qa-site.revalor.test";
export const QA_EMAIL_DOMAIN = "example.com";

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set (see docs/qa-suite.md)`);
  return v;
}

export function target(): string {
  return (process.env.QA_TARGET_URL ?? "https://modules.revalorllc.com").replace(/\/$/, "");
}

let admin: SupabaseClient | null = null;
export function modulesAdmin(): SupabaseClient {
  admin ??= createClient(env("MODULES_SUPABASE_URL"), env("MODULES_SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return admin;
}

export interface TestWorkspace {
  id: string;
  slug: string;
  name: string;
  owner: { id: string; email: string; password: string };
  cleanup: () => Promise<void>;
}

export async function createTestWorkspace(seed: string): Promise<TestWorkspace> {
  const db = modulesAdmin();
  const tag = `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
  const email = `qa+${tag}@${QA_EMAIL_DOMAIN}`;
  const password = `Qa!${randomBytes(18).toString("base64url")}`;

  const { data: u, error: ue } = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { qa: true, seed } });
  if (ue || !u.user) throw new Error(`QA user create failed: ${ue?.message}`);
  const userId = u.user.id;

  const slug = `qa-${tag}`;
  const name = `QA ${tag}`;
  const { data: ws, error: we } = await db
    .from("vw_workspaces")
    .insert({ name, slug, domains: [QA_HOST], plan: "starter", billing_status: "comped", is_test: true, time_zone: "America/New_York" })
    .select("id")
    .single();
  if (we || !ws) {
    await db.auth.admin.deleteUser(userId);
    throw new Error(
      `QA workspace create failed: ${we?.message}${/is_test/.test(we?.message ?? "") ? " (apply the vw_workspace_is_test migration to visionworkx-modules)" : ""}`,
    );
  }
  const { error: me } = await db.from("vw_workspace_members").insert({ workspace_id: ws.id, user_id: userId, role: "owner" });
  if (me) throw new Error(`QA member create failed: ${me.message}`);

  return {
    id: ws.id,
    slug,
    name,
    owner: { id: userId, email, password },
    cleanup: async () => {
      // Every workspace child table cascades on delete. Only is_test rows are ever touched.
      const { error } = await db.from("vw_workspaces").delete().eq("id", ws.id).eq("is_test", true);
      if (error) console.warn(`[qa] cleanup: workspace ${slug} not deleted: ${error.message}`);
      const { error: de } = await db.auth.admin.deleteUser(userId);
      if (de) console.warn(`[qa] cleanup: user ${email} not deleted: ${de.message}`);
    },
  };
}

/** Deletes is_test workspaces and qa+…@example.com users older than `hours` (crashed runs). */
export async function sweepStaleTestData(hours = 3): Promise<void> {
  const db = modulesAdmin();
  const cutoff = new Date(Date.now() - hours * 3600e3).toISOString();
  const { error } = await db.from("vw_workspaces").delete().eq("is_test", true).lt("created_at", cutoff);
  if (error) console.warn(`[qa] sweep: ${error.message}`);
  for (let page = 1; page <= 5; page++) {
    const { data } = await db.auth.admin.listUsers({ page, perPage: 200 });
    const users = data?.users ?? [];
    for (const u of users) {
      if (u.email?.startsWith("qa+") && u.email.endsWith(`@${QA_EMAIL_DOMAIN}`) && u.created_at < cutoff) await db.auth.admin.deleteUser(u.id);
    }
    if (users.length < 200) break;
  }
}

/** Signs the browser in as a workspace member (password sign-in, same session cookie the app sets). */
export async function signIn(context: BrowserContext, who: { email: string; password: string }): Promise<void> {
  const jar = new Map<string, string>();
  const supabase = createServerClient(env("MODULES_SUPABASE_URL"), env("NEXT_PUBLIC_MODULES_SUPABASE_ANON_KEY"), {
    cookieOptions: { name: MODULES_AUTH_COOKIE },
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (list) => list.forEach(({ name, value }) => (value ? jar.set(name, value) : jar.delete(name))),
    },
  });
  const { error } = await supabase.auth.signInWithPassword(who);
  if (error) throw new Error(`QA sign-in failed: ${error.message}`);
  const domain = new URL(target()).hostname;
  await context.addCookies([...jar].map(([name, value]) => ({ name, value, domain, path: "/", secure: true, sameSite: "Lax" as const })));
}

/** Opens the fake customer site with a module's embed snippet on it. */
export async function openHostPage(page: Page, publicId: string): Promise<void> {
  await page.route(`https://${QA_HOST}/**`, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><head><meta charset="utf-8"><title>QA host site</title></head><body>
<h1>QA host site</h1>
<script src="${target()}/embed.js" data-module="${publicId}" async></script>
</body></html>`,
    }),
  );
  await page.goto(`https://${QA_HOST}/`);
}

/** Polls until `fn` returns a value (or times out). */
export async function waitFor<T>(fn: () => Promise<T | null | undefined>, what: string, timeoutMs = 20_000): Promise<T> {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`Timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 1000));
  }
}
