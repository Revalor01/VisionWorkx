import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createServiceClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 300;

// ── Config ────────────────────────────────────────────────────────────────────
const VERCEL_TOKEN = process.env.VERCEL_API_TOKEN!;
const VERCEL_TEAM = process.env.VERCEL_TEAM_ID || null;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const RESEND_KEY = process.env.RESEND_API_KEY!;
const SUPABASE_MGMT_TOKEN = process.env.SUPABASE_MANAGEMENT_TOKEN!;
const SUPABASE_REF = new URL(SUPABASE_URL).hostname.split(".")[0];

const VERCEL_BASE = "https://api.vercel.com";
const SUPABASE_MGMT_BASE = "https://api.supabase.com/v1";

// ── Helpers ───────────────────────────────────────────────────────────────────
function slugify(name: string, id: string) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
  return `vw-${base || "app"}-${id.slice(0, 8)}`;
}

function vercelUrl(path: string) {
  const q = VERCEL_TEAM
    ? `?teamId=${encodeURIComponent(VERCEL_TEAM)}`
    : "";
  return VERCEL_BASE + path + q;
}

const vercelHeaders = {
  Authorization: `Bearer ${VERCEL_TOKEN}`,
  "Content-Type": "application/json",
};

async function vercelPost(path: string, body: unknown) {
  const res = await fetch(vercelUrl(path), {
    method: "POST",
    headers: vercelHeaders,
    body: JSON.stringify(body),
  });
  if (!res.ok)
    throw new Error(
      `Vercel POST ${path} → ${res.status}: ${(await res.text()).slice(0, 400)}`
    );
  return res.json();
}

async function vercelGet(path: string) {
  const res = await fetch(vercelUrl(path), { headers: vercelHeaders });
  if (!res.ok)
    throw new Error(
      `Vercel GET ${path} → ${res.status}: ${(await res.text()).slice(0, 400)}`
    );
  return res.json();
}

async function supabasePatch(table: string, id: string, data: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      Prefer: "return=minimal",
    },
    body: JSON.stringify(data),
  });
  if (!res.ok)
    throw new Error(`Supabase PATCH ${table} failed: ${res.status}`);
}

async function supabaseSQL(sql: string) {
  if (!SUPABASE_MGMT_TOKEN)
    throw new Error("No SUPABASE_MANAGEMENT_TOKEN env var");
  const res = await fetch(
    `${SUPABASE_MGMT_BASE}/projects/${SUPABASE_REF}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SUPABASE_MGMT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    }
  );
  const body = await res.json();
  if (!res.ok || body.message)
    throw new Error(`SQL error: ${body.message || JSON.stringify(body)}`);
  return body;
}

async function exposeSchemaInPostgREST(schema: string) {
  if (!SUPABASE_MGMT_TOKEN) return;
  const res = await fetch(
    `${SUPABASE_MGMT_BASE}/projects/${SUPABASE_REF}/postgrest`,
    { headers: { Authorization: `Bearer ${SUPABASE_MGMT_TOKEN}` } }
  );
  const config = await res.json();
  const current = (config.db_schema || "public,graphql_public")
    .split(",")
    .map((s: string) => s.trim());
  if (current.includes(schema)) return;
  const updated = [...current, schema].join(",");
  await fetch(`${SUPABASE_MGMT_BASE}/projects/${SUPABASE_REF}/postgrest`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${SUPABASE_MGMT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ db_schema: updated }),
  });
}

function parseGeneratedCode(raw: string) {
  const FILE_BLOCK =
    /\[FILENAME:\s*([^\]\r\n]+)\]\r?\n([\s\S]*?)\[\/FILENAME\]/g;
  const files: { path: string; content: string }[] = [];
  let match: RegExpExecArray | null;
  FILE_BLOCK.lastIndex = 0;
  while ((match = FILE_BLOCK.exec(raw)) !== null) {
    const path = match[1].trim().replace(/^\/+/, "");
    const content = match[2].trim();
    if (path) files.push({ path, content });
  }
  return files;
}

function patchFiles(
  files: { path: string; content: string }[],
  schema: string
) {
  const has = (p: string) => files.some((f) => f.path === p);
  const out = files.map((f) => ({ ...f }));

  const tsConf = out.find((f) => f.path === "next.config.ts");
  if (tsConf) {
    tsConf.path = "next.config.mjs";
    tsConf.content = `/** @type {import('next').NextConfig} */\nconst nextConfig = {};\nexport default nextConfig;\n`;
  }
  if (!has("next.config.ts") && !has("next.config.mjs") && !has("next.config.js")) {
    out.push({
      path: "next.config.mjs",
      content: `/** @type {import('next').NextConfig} */\nconst nextConfig = {};\nexport default nextConfig;\n`,
    });
  }

  if (!has("tsconfig.json")) {
    out.push({
      path: "tsconfig.json",
      content: JSON.stringify(
        {
          compilerOptions: {
            target: "ES2017",
            lib: ["dom", "dom.iterable", "esnext"],
            allowJs: true,
            skipLibCheck: true,
            strict: true,
            noEmit: true,
            esModuleInterop: true,
            module: "esnext",
            moduleResolution: "bundler",
            resolveJsonModule: true,
            isolatedModules: true,
            jsx: "preserve",
            incremental: true,
            plugins: [{ name: "next" }],
            paths: { "@/*": ["./*"] },
          },
          include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
          exclude: ["node_modules"],
        },
        null,
        2
      ),
    });
  }

  const browserClientContent = `import { createBrowserClient } from '@supabase/ssr';

const SCHEMA = process.env.NEXT_PUBLIC_SUPABASE_SCHEMA || 'public';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { db: { schema: SCHEMA } }
  );
}
`;

  const serverClientContent = `import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

const SCHEMA = process.env.NEXT_PUBLIC_SUPABASE_SCHEMA || 'public';

export function createServerSupabaseClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: { schema: SCHEMA },
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value; },
        set(name: string, value: string, options: Record<string, unknown>) {
          try { cookieStore.set({ name, value, ...options as object }); } catch {}
        },
        remove(name: string, options: Record<string, unknown>) {
          try { cookieStore.set({ name, value: '', ...options as object }); } catch {}
        },
      },
    }
  );
}

export function createServiceRoleClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: { schema: SCHEMA },
      cookies: { get: () => undefined, set: () => {}, remove: () => {} },
    }
  );
}

export {
  createServerSupabaseClient as createServerBaseClient,
  createServerSupabaseClient as createClient,
};
`;

  const mainFile = out.find((f) => f.path === "lib/supabase.ts");
  if (mainFile) mainFile.content = browserClientContent;
  else out.push({ path: "lib/supabase.ts", content: browserClientContent });

  const serverFile = out.find((f) => f.path === "lib/supabase-server.ts");
  if (serverFile) serverFile.content = serverClientContent;
  else out.push({ path: "lib/supabase-server.ts", content: serverClientContent });

  // Truncation fallbacks
  const schedIdx = out.findIndex((f) => f.path === "components/admin/AdminSchedule.tsx");
  const schedFile = schedIdx >= 0 ? out[schedIdx] : null;
  if (!schedFile || !schedFile.content.includes("export default")) {
    if (schedIdx >= 0) out.splice(schedIdx, 1);
    out.push({
      path: "components/admin/AdminSchedule.tsx",
      content: `"use client";
import { useState } from "react";
export default function AdminSchedule({ scheduledClasses: initial, classTypes, trainers }: { scheduledClasses?: any[], classTypes?: any[], trainers?: any[] }) {
  const [classes] = useState(initial ?? []);
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900">Class Schedule</h2>
        <button className="px-4 py-2 bg-orange-500 text-white text-sm font-semibold rounded-lg hover:bg-orange-600">+ Add Class</button>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200"><tr>
            <th className="text-left px-4 py-3 font-semibold text-gray-600">Class</th>
            <th className="text-left px-4 py-3 font-semibold text-gray-600">Trainer</th>
            <th className="text-left px-4 py-3 font-semibold text-gray-600">Day & Time</th>
            <th className="text-left px-4 py-3 font-semibold text-gray-600">Capacity</th>
          </tr></thead>
          <tbody className="divide-y divide-gray-100">
            {classes.length === 0
              ? <tr><td colSpan={4} className="text-center py-12 text-gray-400">No classes scheduled.</td></tr>
              : classes.map((c: any) => {
                  const dt = new Date(c.start_time);
                  const end = new Date(c.end_time);
                  const fmt = (d: Date) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                  return (
                    <tr key={c.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{c.class_types?.name ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{c.trainers?.name ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{days[dt.getDay()]} {fmt(dt)}–{fmt(end)}</td>
                      <td className="px-4 py-3 text-gray-600">{c.capacity ?? '—'}</td>
                    </tr>
                  );
                })
            }
          </tbody>
        </table>
      </div>
    </div>
  );
}`,
    });
  }

  if (!has("components/admin/AdminTrainers.tsx")) {
    out.push({
      path: "components/admin/AdminTrainers.tsx",
      content: `"use client";
import { useState } from "react";
export default function AdminTrainers({ initialTrainers }: { initialTrainers?: any[] }) {
  const [trainers] = useState(initialTrainers ?? []);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900">Trainers</h2>
        <button className="px-4 py-2 bg-orange-500 text-white text-sm font-semibold rounded-lg hover:bg-orange-600">+ Add Trainer</button>
      </div>
      {trainers.length === 0 ? <p className="text-gray-500 text-center py-12">No trainers yet.</p> : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {trainers.map((t: any) => (
            <div key={t.id} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center text-orange-600 font-bold text-lg">{(t.name||'?')[0]}</div>
                <div><p className="font-semibold text-gray-900">{t.name}</p><p className="text-xs text-gray-500">{t.specialty}</p></div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}`,
    });
  }

  if (!has("components/admin/AdminMembers.tsx")) {
    out.push({
      path: "components/admin/AdminMembers.tsx",
      content: `"use client";
import { useState } from "react";
export default function AdminMembers({ initialMembers }: { initialMembers?: any[] }) {
  const [members] = useState(initialMembers ?? []);
  const [search, setSearch] = useState('');
  const filtered = members.filter((m: any) => !search || (m.name||'').toLowerCase().includes(search.toLowerCase()) || (m.email||'').toLowerCase().includes(search.toLowerCase()));
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-xl font-bold text-gray-900">Members</h2>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search members..." className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-orange-500" />
      </div>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200"><tr>
            <th className="text-left px-4 py-3 font-semibold text-gray-600">Name</th>
            <th className="text-left px-4 py-3 font-semibold text-gray-600">Email</th>
            <th className="text-left px-4 py-3 font-semibold text-gray-600">Joined</th>
          </tr></thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.length === 0 ? <tr><td colSpan={3} className="text-center py-12 text-gray-400">No members found.</td></tr> :
              filtered.map((m: any) => (
                <tr key={m.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{m.name}</td>
                  <td className="px-4 py-3 text-gray-600">{m.email}</td>
                  <td className="px-4 py-3 text-gray-500">{m.joined_at ? new Date(m.joined_at).toLocaleDateString() : '—'}</td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>
    </div>
  );
}`,
    });
  }

  if (!has("components/admin/StaffManager.tsx")) {
    out.push({
      path: "components/admin/StaffManager.tsx",
      content: `"use client";
import { useState } from "react";
export default function StaffManager({ staff: propStaff }: { staff?: any[] }) {
  const [staff] = useState(propStaff ?? []);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Team Members</h2>
        <button className="px-4 py-2 bg-[#6B4F8E] text-white text-sm font-medium rounded-lg hover:bg-[#5a4278] transition-colors">+ Add Staff</button>
      </div>
      {staff.length === 0 ? (
        <div className="text-center py-12 text-gray-500"><p className="font-medium">No staff members yet</p></div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {staff.map((m: any) => (
            <div key={m.id} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <p className="font-semibold text-gray-900">{m.name||m.full_name}</p>
              <p className="text-xs text-gray-500">{m.role}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}`,
    });
  }

  const pkgFile = out.find((f) => f.path === "package.json");
  if (pkgFile) {
    try {
      const pkg = JSON.parse(pkgFile.content);
      pkg.dependencies = pkg.dependencies || {};
      if (!pkg.dependencies["lucide-react"])
        pkg.dependencies["lucide-react"] = "^0.344.0";
      pkgFile.content = JSON.stringify(pkg, null, 2);
    } catch { /* leave as-is */ }
  }

  const envProdIdx = out.findIndex((f) => f.path === ".env.production");
  if (envProdIdx !== -1) out.splice(envProdIdx, 1);

  return out;
}

async function setVercelEnvVars(projectId: string, schema: string) {
  const vars = [
    {
      key: "NEXT_PUBLIC_SUPABASE_URL",
      value: SUPABASE_URL,
      type: "plain",
      target: ["production", "preview"],
    },
    {
      key: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      value: SUPABASE_ANON,
      type: "plain",
      target: ["production", "preview"],
    },
    {
      key: "NEXT_PUBLIC_SUPABASE_SCHEMA",
      value: schema,
      type: "plain",
      target: ["production", "preview"],
    },
  ];

  for (const v of vars) {
    await fetch(vercelUrl(`/v9/projects/${projectId}/env`), {
      method: "GET",
      headers: vercelHeaders,
    })
      .then((r) => r.json())
      .then(async (data) => {
        const existing = (data.envs || []).find(
          (e: { key: string; id: string }) => e.key === v.key
        );
        if (existing) {
          await fetch(
            vercelUrl(`/v9/projects/${projectId}/env/${existing.id}`),
            { method: "DELETE", headers: vercelHeaders }
          );
        }
      })
      .catch(() => {});

    await fetch(vercelUrl(`/v9/projects/${projectId}/env`), {
      method: "POST",
      headers: vercelHeaders,
      body: JSON.stringify(v),
    });
  }
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runDeploy(appId: string, userEmail: string | null) {
  const SCHEMA = `app_${appId.slice(0, 8)}`;

  // 1. Fetch app record
  const appRes = await fetch(
    `${SUPABASE_URL}/rest/v1/apps?id=eq.${appId}&select=id,name,user_id,generated_code,status`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
  );
  const [app] = await appRes.json();
  if (!app?.generated_code) throw new Error("No generated code");

  // 2. Create schema + run migration
  const migrationFile = parseGeneratedCode(app.generated_code).find(
    (f) => f.path.includes("migrations") && f.path.endsWith(".sql")
  );

  if (migrationFile) {
    const migrationSql = migrationFile.content
      .replace(/CREATE EXTENSION IF NOT EXISTS "uuid-ossp";?/g, "")
      .replace(/uuid_generate_v4\(\)/g, "gen_random_uuid()");

    const schemaSql = `
CREATE SCHEMA IF NOT EXISTS "${SCHEMA}";
SET search_path TO "${SCHEMA}";
${migrationSql}

GRANT USAGE ON SCHEMA "${SCHEMA}" TO anon, authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA "${SCHEMA}" TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "${SCHEMA}" TO authenticated;
GRANT INSERT ON ALL TABLES IN SCHEMA "${SCHEMA}" TO anon;
`;
    try {
      await supabaseSQL(schemaSql);
    } catch (err) {
      const msg = (err as Error).message;
      if (!msg.includes("already exists")) throw err;
    }
  }

  // 3. Expose schema in PostgREST
  await exposeSchemaInPostgREST(SCHEMA);

  // 4. Parse + patch files
  const projectName = slugify(app.name, appId);
  const rawFiles = parseGeneratedCode(app.generated_code);
  const files = patchFiles(rawFiles, SCHEMA);

  // 5. Mark deploying
  await supabasePatch("apps", appId, { status: "deploying" });

  // 6. Create Vercel deployment
  const deployment = await vercelPost("/v13/deployments", {
    name: projectName,
    files: files.map((f) => ({ file: f.path, data: f.content })),
    projectSettings: {
      framework: "nextjs",
      installCommand: "npm install",
      buildCommand: "npm run build",
      outputDirectory: ".next",
    },
    target: "production",
  });

  const deployId = deployment.id;
  const vercelProjectId = deployment.projectId;

  // 7. Set env vars
  await setVercelEnvVars(vercelProjectId, SCHEMA);

  // Disable SSO protection
  await fetch(vercelUrl(`/v9/projects/${vercelProjectId}`), {
    method: "PATCH",
    headers: vercelHeaders,
    body: JSON.stringify({ ssoProtection: null }),
  });

  // 8. Poll for READY
  const deadline = Date.now() + 10 * 60 * 1000;
  while (Date.now() < deadline) {
    await delay(8000);
    const status = await vercelGet(`/v13/deployments/${deployId}`);
    if (status.readyState === "READY") break;
    if (status.readyState === "ERROR" || status.readyState === "CANCELED") {
      throw new Error(`Build ${status.readyState}`);
    }
  }

  // 9. Redeploy so env vars take effect
  const redeploy = await vercelPost("/v13/deployments", {
    name: projectName,
    deploymentId: deployId,
    target: "production",
  });
  const redeployId = redeploy.id;
  const finalUrl = `https://${redeploy.url}`;

  const deadline2 = Date.now() + 10 * 60 * 1000;
  while (Date.now() < deadline2) {
    await delay(8000);
    const status = await vercelGet(`/v13/deployments/${redeployId}`);
    if (status.readyState === "READY") break;
    if (status.readyState === "ERROR" || status.readyState === "CANCELED") {
      throw new Error(`Redeploy ${status.readyState}`);
    }
  }

  // 10. Save URL + email
  await supabasePatch("apps", appId, {
    deploy_url: finalUrl,
    status: "deployed",
  });

  if (RESEND_KEY && userEmail) {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Vision Workx <onboarding@resend.dev>",
        to: [userEmail],
        subject: `Your app "${app.name}" is live!`,
        html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:40px 20px"><h1 style="color:#1A3A5C">Your app is live!</h1><p>Your <strong>${app.name}</strong> app is deployed and connected to your database.</p><p style="margin:30px 0"><a href="${finalUrl}" style="background:#1A3A5C;color:white;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:bold">View Your Live App →</a></p><p style="color:#666;font-size:14px">Vision Workx · A Revalor Company</p></div>`,
      }),
    }).catch(() => {});
  }

  return finalUrl;
}

// ── POST /api/deploy ──────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  let body: { appId?: string; _internal?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const appId = body.appId ?? "";
  if (!appId) {
    return NextResponse.json({ error: "Missing appId" }, { status: 400 });
  }

  const serviceClient = createServiceClient();
  let userEmail: string | null = null;

  // Internal calls from /api/generate use service role key authorization
  const authHeader = req.headers.get("authorization") ?? "";
  const isInternal = body._internal === true && authHeader === `Bearer ${SERVICE_KEY}`;

  if (!isInternal) {
    // Browser-initiated deploy: verify session
    const supabase = createServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: app } = await serviceClient
      .from("apps")
      .select("id, status")
      .eq("id", appId)
      .eq("user_id", user.id)
      .single();

    if (!app) {
      return NextResponse.json({ error: "App not found" }, { status: 404 });
    }

    userEmail = user.email ?? null;
  }

  const { data: appCheck } = await serviceClient
    .from("apps")
    .select("id, status")
    .eq("id", appId)
    .single();

  if (!appCheck) {
    return NextResponse.json({ error: "App not found" }, { status: 404 });
  }
  if (appCheck.status === "deployed") {
    return NextResponse.json({ error: "Already deployed" }, { status: 409 });
  }

  // Fetch user email if not already set (internal call path)
  if (!userEmail) {
    const { data: appData } = await serviceClient
      .from("apps")
      .select("user_id")
      .eq("id", appId)
      .single();
    if (appData?.user_id) {
      const { data: profile } = await serviceClient
        .from("profiles")
        .select("id")
        .eq("id", appData.user_id)
        .single();
      // Email is in auth.users — we'll pass null and skip email for internal deploys
      // (the email will be sent when userEmail is available from the webhook flow)
      void profile;
    }
  }

  try {
    const url = await runDeploy(appId, userEmail);
    return NextResponse.json({ url });
  } catch (err) {
    console.error("[api/deploy]", err);
    await serviceClient
      .from("apps")
      .update({ status: "failed" })
      .eq("id", appId)
      .catch(() => {});
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
