/**
 * Vision Workx — Customer App Deploy Pipeline
 *
 * Usage:  node deploy-app.mjs <appId>
 *
 * Steps:
 *  1. Fetch generated code from Supabase apps table
 *  2. Create a PostgreSQL schema in Vision Workx Supabase (Option B multi-tenant)
 *  3. Run the app's migration SQL inside that schema
 *  4. Patch the generated lib/supabase.ts to be schema-aware
 *  5. Set Vercel project env vars (URL, anon key, schema)
 *  6. Deploy to Vercel and poll for READY
 *  7. Save deploy_url back to apps table + send email
 *
 * Migration to Option A (own Supabase project) at ~25 customers:
 *  - pg_dump the schema, restore to new project's public schema
 *  - Update 3 Vercel env vars, redeploy — zero code changes needed
 */

import { readFileSync } from 'fs';
import { execSync } from 'child_process';

// ── Config ────────────────────────────────────────────────────────────────────
const env = {};
readFileSync('/Users/revalor-prime/vision-workx/.env.local', 'utf8')
  .split('\n').forEach(line => {
    const [k, ...vs] = line.split('=');
    if (k?.trim() && vs.length) env[k.trim()] = vs.join('=').trim();
  });

const VERCEL_TOKEN   = env['VERCEL_API_TOKEN'];
const VERCEL_TEAM    = env['VERCEL_TEAM_ID'] || null;
const SUPABASE_URL   = env['NEXT_PUBLIC_SUPABASE_URL'];
const SUPABASE_ANON  = env['NEXT_PUBLIC_SUPABASE_ANON_KEY'];
const SERVICE_KEY    = env['SUPABASE_SERVICE_ROLE_KEY'];
const RESEND_KEY     = env['RESEND_API_KEY'];

// Supabase project ref (from URL: https://{ref}.supabase.co)
const SUPABASE_REF   = new URL(SUPABASE_URL).hostname.split('.')[0];
// Management API token — read from Supabase CLI keychain entry
const SUPABASE_MGMT_TOKEN = (() => {
  try { return execSync('security find-generic-password -s "Supabase CLI" -w', { stdio: ['pipe', 'pipe', 'pipe'] }).toString().trim(); }
  catch { return null; }
})();

const APP_ID = process.argv[2] || '741aa936-5a4d-4d35-a2c8-abafbad7c7e3';
const SCHEMA = `app_${APP_ID.slice(0, 8)}`;

const VERCEL_BASE = 'https://api.vercel.com';
const SUPABASE_MGMT_BASE = 'https://api.supabase.com/v1';

// ── Helpers ───────────────────────────────────────────────────────────────────
function slugify(name, id) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '').slice(0, 30);
  return `vw-${base || 'app'}-${id.slice(0, 8)}`;
}

function vercelUrl(path) {
  const q = VERCEL_TEAM ? `?teamId=${encodeURIComponent(VERCEL_TEAM)}` : '';
  return VERCEL_BASE + path + q;
}

const vercelHeaders = { 'Authorization': `Bearer ${VERCEL_TOKEN}`, 'Content-Type': 'application/json' };

async function vercelPost(path, body) {
  const res = await fetch(vercelUrl(path), { method: 'POST', headers: vercelHeaders, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Vercel POST ${path} → ${res.status}: ${(await res.text()).slice(0, 400)}`);
  return res.json();
}

async function vercelGet(path) {
  const res = await fetch(vercelUrl(path), { headers: vercelHeaders });
  if (!res.ok) throw new Error(`Vercel GET ${path} → ${res.status}: ${(await res.text()).slice(0, 400)}`);
  return res.json();
}

async function supabasePatch(table, id, data) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}`, 'Prefer': 'return=minimal' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Supabase PATCH ${table} failed: ${res.status}`);
}

async function supabaseGet(table, params) {
  const qs = Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${qs}`, {
    headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` },
  });
  if (!res.ok) throw new Error(`Supabase GET ${table} failed: ${res.status}`);
  return res.json();
}

async function supabaseSQL(sql) {
  if (!SUPABASE_MGMT_TOKEN) throw new Error('No Supabase management token found. Run: supabase login');
  const res = await fetch(`${SUPABASE_MGMT_BASE}/projects/${SUPABASE_REF}/database/query`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${SUPABASE_MGMT_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const body = await res.json();
  if (!res.ok || body.message) throw new Error(`SQL error: ${body.message || JSON.stringify(body)}`);
  return body;
}

async function exposeSchemaInPostgREST(schema) {
  if (!SUPABASE_MGMT_TOKEN) return;
  const res = await fetch(`${SUPABASE_MGMT_BASE}/projects/${SUPABASE_REF}/postgrest`, {
    headers: { 'Authorization': `Bearer ${SUPABASE_MGMT_TOKEN}` },
  });
  const config = await res.json();
  const current = (config.db_schema || 'public,graphql_public').split(',').map(s => s.trim());
  if (current.includes(schema)) return; // already exposed
  const updated = [...current, schema].join(',');
  await fetch(`${SUPABASE_MGMT_BASE}/projects/${SUPABASE_REF}/postgrest`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${SUPABASE_MGMT_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ db_schema: updated }),
  });
  // PostgREST reloads within a few seconds; no restart needed
  console.log(`   ✓ Exposed "${schema}" in PostgREST (db_schema: ${updated})`);
}

function parseGeneratedCode(raw) {
  const FILE_BLOCK = /\[FILENAME:\s*([^\]\r\n]+)\]\r?\n([\s\S]*?)\[\/FILENAME\]/g;
  const files = [];
  let match;
  FILE_BLOCK.lastIndex = 0;
  while ((match = FILE_BLOCK.exec(raw)) !== null) {
    const path = match[1].trim().replace(/^\/+/, '');
    const content = match[2].trim();
    if (path) files.push({ path, content });
  }
  return files;
}

function patchFiles(files, schema, projectName) {
  const has = (p) => files.some(f => f.path === p);
  const out = files.map(f => ({ ...f }));

  // ── next.config.ts → .mjs (Next.js 14 doesn't support .ts config) ──────────
  const tsConf = out.find(f => f.path === 'next.config.ts');
  if (tsConf) {
    tsConf.path = 'next.config.mjs';
    tsConf.content = `/** @type {import('next').NextConfig} */\nconst nextConfig = {};\nexport default nextConfig;\n`;
  }
  if (!has('next.config.ts') && !has('next.config.mjs') && !has('next.config.js')) {
    out.push({ path: 'next.config.mjs', content: `/** @type {import('next').NextConfig} */\nconst nextConfig = {};\nexport default nextConfig;\n` });
  }

  // ── tsconfig.json — ensure @/ alias exists ─────────────────────────────────
  if (!has('tsconfig.json')) {
    out.push({
      path: 'tsconfig.json',
      content: JSON.stringify({ compilerOptions: { target: 'ES2017', lib: ['dom', 'dom.iterable', 'esnext'], allowJs: true, skipLibCheck: true, strict: true, noEmit: true, esModuleInterop: true, module: 'esnext', moduleResolution: 'bundler', resolveJsonModule: true, isolatedModules: true, jsx: 'preserve', incremental: true, plugins: [{ name: 'next' }], paths: { '@/*': ['./*'] } }, include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts'], exclude: ['node_modules'] }, null, 2),
    });
  }

  // ── Patch Supabase clients to be schema-aware ────────────────────────────
  // Split into two files: browser client (no next/headers) + server client.
  // This avoids "can't import next/headers in client components" build errors.
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

export { createServerSupabaseClient as createServerBaseClient };
`;

  const mainFile = out.find(f => f.path === 'lib/supabase.ts');
  if (mainFile) mainFile.content = browserClientContent;
  else out.push({ path: 'lib/supabase.ts', content: browserClientContent });

  const serverFile = out.find(f => f.path === 'lib/supabase-server.ts');
  if (serverFile) serverFile.content = serverClientContent;
  else out.push({ path: 'lib/supabase-server.ts', content: serverClientContent });

  // ── Inject missing components (truncation fallback) ─────────────────────────
  if (!has('components/admin/StaffManager.tsx')) {
    out.push({
      path: 'components/admin/StaffManager.tsx',
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
        <div className="text-center py-12 text-gray-500"><div className="text-4xl mb-3">👥</div><p className="font-medium">No staff members yet</p></div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {staff.map((m: any) => (
            <div key={m.id} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-full bg-[#6B4F8E]/10 flex items-center justify-center text-[#6B4F8E] font-bold">{(m.name||m.full_name||'?').charAt(0)}</div>
                <div><p className="font-semibold text-gray-900">{m.name||m.full_name}</p><p className="text-xs text-gray-500">{m.role}</p></div>
                <span className={\`ml-auto text-xs px-2 py-0.5 rounded-full \${m.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}\`}>{m.is_active ? 'Active' : 'Inactive'}</span>
              </div>
              {m.bio && <p className="text-xs text-gray-500 mt-1">{m.bio}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}`,
    });
  }

  // ── Remove .env.production — we use Vercel env vars instead ─────────────────
  const envProdIdx = out.findIndex(f => f.path === '.env.production');
  if (envProdIdx !== -1) out.splice(envProdIdx, 1);

  return out;
}

async function setVercelEnvVars(projectId, schema) {
  const vars = [
    { key: 'NEXT_PUBLIC_SUPABASE_URL',    value: SUPABASE_URL,   type: 'plain',     target: ['production', 'preview'] },
    { key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', value: SUPABASE_ANON, type: 'plain',    target: ['production', 'preview'] },
    { key: 'NEXT_PUBLIC_SUPABASE_SCHEMA', value: schema,          type: 'plain',     target: ['production', 'preview'] },
  ];

  for (const v of vars) {
    // Delete existing first (ignore errors)
    await fetch(vercelUrl(`/v9/projects/${projectId}/env`), {
      method: 'GET', headers: vercelHeaders,
    }).then(r => r.json()).then(async data => {
      const existing = (data.envs || []).find(e => e.key === v.key);
      if (existing) {
        await fetch(vercelUrl(`/v9/projects/${projectId}/env/${existing.id}`), {
          method: 'DELETE', headers: vercelHeaders,
        });
      }
    }).catch(() => {});

    const res = await fetch(vercelUrl(`/v9/projects/${projectId}/env`), {
      method: 'POST', headers: vercelHeaders,
      body: JSON.stringify(v),
    });
    if (!res.ok) {
      const t = await res.text();
      console.warn(`  ⚠ Could not set ${v.key}: ${t.slice(0, 120)}`);
    } else {
      console.log(`  ✓ ${v.key} = ${v.value === SUPABASE_ANON ? '***' : v.value}`);
    }
  }
}

async function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🚀 Vision Workx Deploy Pipeline`);
  console.log(`   App ID : ${APP_ID}`);
  console.log(`   Schema : ${SCHEMA}`);
  console.log(`   Mode   : Option B (multi-tenant, Vision Workx Supabase)\n`);

  // ── 1. Fetch app record ───────────────────────────────────────────────────
  console.log('📦 Fetching app from Supabase...');
  const [app] = await supabaseGet('apps', { 'id': `eq.${APP_ID}`, 'select': 'id,name,user_id,generated_code,status' });
  if (!app) throw new Error('App not found');
  if (!app.generated_code) throw new Error('No generated code');
  console.log(`   ${app.name} (${app.status})`);

  // ── 2. Create schema + run migration ─────────────────────────────────────
  console.log(`\n🗄  Provisioning schema "${SCHEMA}" in Vision Workx Supabase...`);
  const migrationFile = parseGeneratedCode(app.generated_code)
    .find(f => f.path.includes('migrations') && f.path.endsWith('.sql'));

  if (migrationFile) {
    const migrationSql = migrationFile.content
      .replace(/CREATE EXTENSION IF NOT EXISTS "uuid-ossp";?/g, '')
      .replace(/uuid_generate_v4\(\)/g, 'gen_random_uuid()');

    const schemaSql = `
CREATE SCHEMA IF NOT EXISTS "${SCHEMA}";
SET search_path TO "${SCHEMA}";
${migrationSql}

-- Grant anon + authenticated access to the schema and tables
-- (Supabase only auto-grants on "public"; custom schemas need explicit grants)
GRANT USAGE ON SCHEMA "${SCHEMA}" TO anon, authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA "${SCHEMA}" TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "${SCHEMA}" TO authenticated;
-- anon can insert appointments (public booking form)
GRANT INSERT ON "${SCHEMA}".appointments TO anon;
`;

    try {
      await supabaseSQL(schemaSql);
      console.log(`   ✓ Schema created and seeded`);
    } catch (err) {
      // Schema may already exist from a previous run
      if (err.message.includes('already exists')) {
        console.log(`   ℹ Schema already exists — skipping migration`);
      } else {
        throw err;
      }
    }
  } else {
    console.log(`   ⚠ No migration SQL found in generated code — schema must be created manually`);
  }

  // ── 2b. Expose schema in PostgREST ───────────────────────────────────────
  // Custom schemas are not accessible via REST API until added to db_schema list.
  console.log(`\n🔓 Exposing "${SCHEMA}" in PostgREST...`);
  await exposeSchemaInPostgREST(SCHEMA);

  // ── 3. Parse + patch files ────────────────────────────────────────────────
  const projectName = slugify(app.name, APP_ID);
  const rawFiles = parseGeneratedCode(app.generated_code);
  const files = patchFiles(rawFiles, SCHEMA, projectName);
  console.log(`\n📁 Prepared ${files.length} files for deployment`);

  // ── 4. Mark deploying ─────────────────────────────────────────────────────
  await supabasePatch('apps', APP_ID, { status: 'deploying' });

  // ── 5. Create Vercel deployment ───────────────────────────────────────────
  console.log('\n🔨 Creating Vercel deployment...');
  const deployment = await vercelPost('/v13/deployments', {
    name: projectName,
    files: files.map(f => ({ file: f.path, data: f.content })),
    projectSettings: { framework: 'nextjs', installCommand: 'npm install', buildCommand: 'npm run build', outputDirectory: '.next' },
    target: 'production',
  });

  const deployId = deployment.id;
  const vercelProjectId = deployment.projectId;
  const deployUrl = `https://${deployment.url}`;
  console.log(`   Deployment : ${deployId}`);
  console.log(`   Project    : ${vercelProjectId}`);
  console.log(`   URL        : ${deployUrl}`);

  // ── 6. Set Vercel env vars on the project ─────────────────────────────────
  console.log('\n🔑 Setting Vercel env vars...');
  await setVercelEnvVars(vercelProjectId, SCHEMA);

  // Disable deployment protection
  await fetch(vercelUrl(`/v9/projects/${vercelProjectId}`), {
    method: 'PATCH', headers: vercelHeaders,
    body: JSON.stringify({ ssoProtection: null }),
  });
  console.log('   ✓ Deployment protection disabled');

  // ── 7. Poll for READY ─────────────────────────────────────────────────────
  console.log('\n⏳ Waiting for build...');
  const deadline = Date.now() + 10 * 60 * 1000;
  let lastState = '';
  while (Date.now() < deadline) {
    await delay(8000);
    const status = await vercelGet(`/v13/deployments/${deployId}`);
    if (status.readyState !== lastState) { console.log(`   ${status.readyState}`); lastState = status.readyState; }
    if (status.readyState === 'READY') { console.log('\n✅ Build READY!'); break; }
    if (status.readyState === 'ERROR' || status.readyState === 'CANCELED') {
      const logs = await vercelGet(`/v2/deployments/${deployId}/events`).catch(() => ({}));
      const errLines = ((logs.events||[]).slice(-20)).map(e => e.payload?.text||'').join('\n');
      throw new Error(`Build ${status.readyState}\n${errLines}`);
    }
  }

  // ── 8. Trigger redeploy so env vars take effect ───────────────────────────
  // The first deployment baked in env vars from .env.production (now removed).
  // Redeploy so Vercel injects the env vars we just set.
  console.log('\n🔄 Redeploying with env vars...');
  const redeploy = await vercelPost('/v13/deployments', {
    name: projectName,
    deploymentId: deployId,
    target: 'production',
  });
  const redeployId = redeploy.id;
  const finalUrl = `https://${redeploy.url}`;
  console.log(`   Redeploy ID : ${redeployId}`);

  const deadline2 = Date.now() + 10 * 60 * 1000;
  lastState = '';
  while (Date.now() < deadline2) {
    await delay(8000);
    const status = await vercelGet(`/v13/deployments/${redeployId}`);
    if (status.readyState !== lastState) { console.log(`   ${status.readyState}`); lastState = status.readyState; }
    if (status.readyState === 'READY') { console.log('✅ Redeploy READY!'); break; }
    if (status.readyState === 'ERROR' || status.readyState === 'CANCELED') {
      throw new Error(`Redeploy ${status.readyState}`);
    }
  }

  // ── 9. Save + email ───────────────────────────────────────────────────────
  console.log('\n💾 Saving to Supabase...');
  await supabasePatch('apps', APP_ID, { deploy_url: finalUrl, status: 'deployed' });
  console.log(`   ✓ deploy_url = ${finalUrl}`);

  if (RESEND_KEY) {
    console.log('\n📧 Sending email...');
    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Vision Workx <onboarding@resend.dev>',
        to: ['sawilliams721@gmail.com'],
        subject: `Your app "${app.name}" is live!`,
        html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:40px 20px"><h1 style="color:#1A3A5C">Your app is live! 🚀</h1><p>Your <strong>${app.name}</strong> is deployed and connected to your database.</p><p style="margin:30px 0"><a href="${finalUrl}" style="background:#1A3A5C;color:white;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:bold">View Your Live App →</a></p><p style="color:#666;font-size:14px">Vision Workx · A Revalor Company</p></div>`,
      }),
    });
    if (emailRes.ok) console.log('   ✓ Email sent');
    else console.warn('   ⚠ Email failed:', await emailRes.text());
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  DEPLOYMENT COMPLETE');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  App    : ${app.name}`);
  console.log(`  Schema : ${SCHEMA} (Vision Workx Supabase)`);
  console.log(`  URL    : ${finalUrl}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

main().catch(err => { console.error('\n❌ Deploy failed:', err.message); process.exit(1); });
