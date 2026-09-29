import { randomBytes } from "crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { request as playwrightRequest, type APIRequestContext, type BrowserContext, type Page } from "@playwright/test";
import { MODULES_AUTH_COOKIE } from "../../lib/modules/constants";
import { targetFor } from "../products";

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
  return targetFor("visionworkx");
}

let admin: SupabaseClient | null = null;
export function modulesAdmin(): SupabaseClient {
  admin ??= createClient(env("MODULES_SUPABASE_URL"), env("MODULES_SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return admin;
}

function newTag(): string {
  return `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
}

function newPassword(): string {
  return `Qa!${randomBytes(18).toString("base64url")}`;
}

/**
 * Resend's test inbox: "delivers" without a real mailbox and without any hit
 * to sender reputation. Use it for anything that sends email.
 */
export function resendTestAddress(label: string): string {
  return `delivered+${label.replace(/[^a-z0-9]/gi, "").toLowerCase()}@resend.dev`;
}

// ── users and workspaces ──────────────────────────────────────────────────────

export interface QaUser {
  id: string;
  email: string;
  password: string;
  /** Deletes the user and any is_test workspace they created. */
  cleanup: () => Promise<void>;
}

/** A signed-up user with no workspace yet (for onboarding tests). */
export async function createQaUser(seed: string): Promise<QaUser> {
  const db = modulesAdmin();
  const email = `qa+${newTag()}@${QA_EMAIL_DOMAIN}`;
  const password = newPassword();
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { qa: true, seed } });
  if (error || !data.user) throw new Error(`QA user create failed: ${error?.message}`);
  const id = data.user.id;
  return {
    id,
    email,
    password,
    cleanup: async () => {
      const { error: we } = await db.from("vw_workspaces").delete().eq("created_by", id).eq("is_test", true);
      if (we) console.warn(`[qa] cleanup: workspaces of ${email} not deleted: ${we.message}`);
      const { error: de } = await db.auth.admin.deleteUser(id);
      if (de) console.warn(`[qa] cleanup: user ${email} not deleted: ${de.message}`);
    },
  };
}

export interface WorkspaceOptions {
  /** Where owner alerts go. Default: none, so nothing is emailed. Use resendTestAddress() to test emails. */
  notificationEmail?: string | null;
  plan?: "starter" | "growth" | "pro";
  /** Default "comped" (no Stripe). "none" = no plan yet, for billing tests (billing sync skips comped workspaces). */
  billingStatus?: "comped" | "none";
}

export interface TestWorkspace {
  id: string;
  slug: string;
  name: string;
  owner: { id: string; email: string; password: string };
  cleanup: () => Promise<void>;
}

export async function createTestWorkspace(seed: string, opts: WorkspaceOptions = {}): Promise<TestWorkspace> {
  const db = modulesAdmin();
  const tag = newTag();
  const email = `qa+${tag}@${QA_EMAIL_DOMAIN}`;
  const password = newPassword();

  const { data: u, error: ue } = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { qa: true, seed } });
  if (ue || !u.user) throw new Error(`QA user create failed: ${ue?.message}`);
  const userId = u.user.id;

  const slug = `qa-${tag}`;
  const name = `QA ${tag}`;
  const { data: ws, error: we } = await db
    .from("vw_workspaces")
    .insert({
      name,
      slug,
      domains: [QA_HOST],
      plan: opts.plan ?? "starter",
      billing_status: opts.billingStatus ?? "comped",
      is_test: true,
      time_zone: "America/New_York",
      notification_email: opts.notificationEmail ?? null,
    })
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
  await context.addCookies(await sessionCookies(who));
}

/** An API client signed in as a workspace member (for owner actions without a page). Dispose it when done. */
export async function memberApi(who: { email: string; password: string }): Promise<APIRequestContext> {
  return playwrightRequest.newContext({
    baseURL: target(),
    storageState: { cookies: (await sessionCookies(who)).map((c) => ({ ...c, expires: -1, httpOnly: false })), origins: [] },
    extraHTTPHeaders: { Origin: target() },
  });
}

async function sessionCookies(who: { email: string; password: string }) {
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
  return [...jar].map(([name, value]) => ({ name, value, domain, path: "/", secure: true, sameSite: "Lax" as const }));
}

// ── Google Calendar (the QA Google account) ───────────────────────────────────

/**
 * revalor.qa@gmail.com is connected ONCE, by hand, to the permanent "Revalor
 * QA Calendar" workspace (never is_test, never disconnected). Calendar tests
 * copy that saved (encrypted) connection into their throwaway workspace, so
 * no Google password or token ever leaves the database. Never call the app's
 * Disconnect on a copied connection -- it revokes the grant for everyone.
 */
export const QA_GOOGLE_ACCOUNT = "revalor.qa@gmail.com";

export async function connectQaCalendar(workspaceId: string): Promise<void> {
  const db = modulesAdmin();
  const { data: src, error } = await db
    .from("vw_calendar_connections")
    .select("provider, account_email, calendar_id, refresh_token_enc, connected_by, vw_workspaces!inner(is_test)")
    .eq("account_email", QA_GOOGLE_ACCOUNT)
    .eq("status", "active")
    .eq("vw_workspaces.is_test", false) // the permanent workspace, not another test's copy
    .not("refresh_token_enc", "is", null)
    .order("connected_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !src) {
    throw new Error(
      `No active Google Calendar connection for ${QA_GOOGLE_ACCOUNT}${error ? ` (${error.message})` : ""}. ` +
        "Reconnect it in the Revalor QA Calendar workspace's Settings (see docs/qa-suite.md).",
    );
  }
  const { vw_workspaces: _ws, ...row } = src as typeof src & { vw_workspaces: unknown };
  void _ws;
  const { error: ie } = await db.from("vw_calendar_connections").insert({ ...row, workspace_id: workspaceId, status: "active" });
  if (ie) throw new Error(`Copying the QA calendar connection failed: ${ie.message}`);
}

// ── modules ───────────────────────────────────────────────────────────────────

export interface CreatedModule {
  id: string;
  publicId: string;
}

/** Inserts a module directly (skipping the builder UI); live unless told otherwise. */
export async function createModule(
  workspaceId: string,
  type: "lead_capture" | "quote_calculator" | "booking",
  config: Record<string, unknown>,
  status: "live" | "draft" = "live",
): Promise<CreatedModule> {
  const { data, error } = await modulesAdmin()
    .from("vw_modules")
    .insert({ workspace_id: workspaceId, type, name: `QA ${type}`, config, status })
    .select("id, public_id")
    .single();
  if (error || !data) throw new Error(`QA module create failed: ${error?.message}`);
  return { id: data.id, publicId: data.public_id };
}

/** A plain form config with the given fields (no payment). */
export function formConfig(fields: Record<string, unknown>[], extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    title: "QA form",
    intro: "Automated test.",
    submitLabel: "Send",
    successMessage: "Thanks — QA got it.",
    redirectUrl: null,
    style: {},
    fields,
    payment: null,
    ...extra,
  };
}

export const NAME_FIELD = { id: "name", label: "Full name", type: "text", required: true, maxLength: 120 };
export const EMAIL_FIELD = { id: "email", label: "Email", type: "email", required: true, maxLength: 254 };

/** Opens the fake customer site with a module's embed snippet on it. */
export async function openHostPage(page: Page, publicId: string, host = QA_HOST): Promise<void> {
  await page.route(`https://${host}/**`, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>QA host site</title></head><body>
<h1>QA host site</h1>
<script src="${target()}/embed.js" data-module="${publicId}" async></script>
</body></html>`,
    }),
  );
  await page.goto(`https://${host}/`);
}

/** POSTs a submission the way a visitor's browser on `host` would. */
export async function submitViaApi(
  request: APIRequestContext,
  publicId: string,
  body: Record<string, unknown>,
  host = QA_HOST,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await request.post(`${target()}/api/m/${publicId}/submit`, {
    headers: { Origin: `https://${host}`, "Content-Type": "application/json" },
    data: { source_url: `https://${host}/`, vw_hp: "", ...body },
  });
  return { status: res.status(), json: (await res.json().catch(() => ({}))) as Record<string, unknown> };
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
