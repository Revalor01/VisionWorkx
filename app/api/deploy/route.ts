import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServerClient, createServiceClient } from "@/lib/supabase";
import { HEX_COLOR_RE, hexToRgbTriplet } from "@/lib/color";
import { logAiUsage } from "@/lib/aiUsage";
import { finalizeRevision } from "@/lib/apps/redeploy";
import { parseFileList, parseFileMap, serializeFileMap } from "@/lib/apps/fileMap";
import { repairGenerated } from "@/lib/apps/repairGenerated";
import type { AppCategory, IntakeData } from "@/lib/database.types";

// Storage path shape written by uploadLogo() ("<userId>/<timestamp>.<ext>") —
// validated before ever being interpolated into raw SQL for the site_settings
// seed. No quotes, semicolons, or backslashes are possible in a matching value.
const LOGO_PATH_RE = /^[a-zA-Z0-9-]+\/[a-zA-Z0-9_.-]+$/;

export const runtime = "nodejs";
// One deployment + one poll loop now covers the whole pipeline (previously
// two full sequential deployments, each with its own 10-minute poll budget,
// routinely exceeded a 300s ceiling and got hard-killed by the platform
// mid-poll, leaving apps.status stuck at "deploying" with no error ever
// recorded). 800s leaves headroom above the single ~9-minute poll deadline
// below for migration/schema/repair work.
export const maxDuration = 800;

// ── Config ────────────────────────────────────────────────────────────────────
const VERCEL_TOKEN = process.env.VERCEL_API_TOKEN!;
const VERCEL_TEAM = process.env.VERCEL_TEAM_ID || null;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const RESEND_KEY = process.env.RESEND_API_KEY!;
const SUPABASE_MGMT_TOKEN = process.env.SUPABASE_MANAGEMENT_TOKEN!;
const SUPABASE_REF = new URL(SUPABASE_URL).hostname.split(".")[0];
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

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

// Thrown by runDeploy when Vercel reports the customer app's build failed —
// carries the compiler errors so the POST handler can run one repair pass.
class BuildError extends Error {
  constructor(
    public readonly state: string,
    public readonly logs: string,
  ) {
    super(`Build ${state}`);
    this.name = "BuildError";
  }
}

const BUILD_ERROR_LINE =
  /(error|Type error|Cannot find|Module not found|Failed to compile|does not exist on type|has no exported member|is not assignable|Unexpected token|Expected|SyntaxError)/i;

// Pull the failing lines out of a deployment's build log.
async function fetchBuildErrors(deployId: string): Promise<string> {
  const res = await fetch(
    vercelUrl(`/v3/deployments/${deployId}/events?builds=1&direction=backward&limit=400`),
    { headers: vercelHeaders },
  );
  if (!res.ok) return "";
  const events = await res.json();
  const lines: string[] = [];
  for (const e of Array.isArray(events) ? events : []) {
    const text: string = e?.payload?.text ?? e?.text ?? "";
    if (text && BUILD_ERROR_LINE.test(text)) lines.push(text.replace(/\[[0-9;]*m/g, "").trimEnd());
  }
  // Newest-first from the API; show oldest-first, cap the volume.
  return lines.reverse().slice(-60).join("\n").slice(0, 6000);
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

// Generated migrations run with search_path scoped to the tenant's own
// schema, but statements that explicitly qualify a shared schema (auth,
// public, storage, ...) bypass that isolation entirely — e.g. a generated
// `CREATE TRIGGER ... ON auth.users` silently replaces the platform's own
// on_auth_user_created trigger and breaks signups for every customer.
// Foreign keys like `references auth.users(id)` are fine and expected;
// only DDL/DML that targets a shared schema's objects is forbidden.
const FORBIDDEN_MIGRATION_PATTERNS: { re: RegExp; label: string }[] = [
  {
    re: /\b(create\s+(or\s+replace\s+)?|drop\s+)trigger\b[\s\S]{0,300}?\bon\s+auth\.users\b/gi,
    label: "trigger on auth.users",
  },
  {
    re: /\bcreate\s+(or\s+replace\s+)?function\s+auth\./gi,
    label: "function defined in auth schema",
  },
  {
    re: /\b(insert\s+into|update|delete\s+from)\s+auth\.users\b/gi,
    label: "data mutation on auth.users",
  },
  {
    re: /\b(create|alter|drop)\s+(table|view|function|trigger|policy|type|index|schema)\s+(if\s+(not\s+)?exists\s+)?public\./gi,
    label: "DDL targeting the public schema",
  },
];

function findForbiddenMigrationStatements(sql: string): string[] {
  const hits = new Set<string>();
  for (const { re, label } of FORBIDDEN_MIGRATION_PATTERNS) {
    re.lastIndex = 0;
    if (re.test(sql)) hits.add(label);
  }
  return Array.from(hits);
}

// Single source of truth — same parser the revision/edit features use, so
// the two can never drift. Handles `]` in a path (Next.js dynamic routes).
const parseGeneratedCode = parseFileList;

// Claude sometimes references a component in an import without ever emitting
// that file in its own output — a one-shot generation dropping a file it
// meant to write. Left unchecked this only surfaces as a Vercel build
// failure ~15s and one wasted deploy later. Scan every generated file's
// `@/...` imports and confirm each one resolves to a file we actually have.
function findMissingLocalImports(files: { path: string; content: string }[]): string[] {
  const has = (p: string) => files.some((f) => f.path === p);
  const resolvable = (spec: string) =>
    [spec, `${spec}.ts`, `${spec}.tsx`, `${spec}/index.ts`, `${spec}/index.tsx`].some(has);

  const IMPORT_RE = /from\s+["']@\/([^"']+)["']/g;
  const missing = new Set<string>();
  for (const f of files) {
    if (!/\.(tsx?|jsx?)$/.test(f.path)) continue;
    IMPORT_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = IMPORT_RE.exec(f.content)) !== null) {
      if (!resolvable(m[1])) missing.add(m[1]);
    }
  }
  return Array.from(missing);
}

// SYSTEM_PROMPT rule 13 forbids literal hex colors so the AI's UI stays
// runtime-configurable via site_settings, but nothing enforces that at the
// build level — a stray bg-[#1A3A5C] compiles and deploys fine, it just
// silently won't respond to a future color change. Log-only for now: unlike
// findMissingLocalImports's target (a guaranteed build failure), this is a
// low-urgency cosmetic gap, and a mechanical rewrite risks a real
// correctness regression (an arbitrary-value hex class isn't necessarily
// "the brand color done wrong" — could be an intentional error-red or
// muted-gray) that would need a second Claude call to judge safely.
const HEX_COLOR_CLASS_RE =
  /\b(?:bg|text|border|ring|from|via|to|fill|stroke)-\[#[0-9a-fA-F]{3,8}\]/g;

function findLiteralColorClasses(
  files: { path: string; content: string }[]
): { path: string; count: number }[] {
  return files
    .filter((f) => /\.(tsx?|jsx?)$/.test(f.path))
    .map((f) => ({
      path: f.path,
      count: (f.content.match(HEX_COLOR_CLASS_RE) ?? []).length,
    }))
    .filter((r) => r.count > 0);
}

// One focused follow-up call asking only for the missing files, instead of
// a full regeneration — much cheaper, and gives the same model the exact
// gap to fill in rather than hoping a second one-shot attempt does better.
async function repairMissingFiles(
  files: { path: string; content: string }[],
  missing: string[]
): Promise<{ path: string; content: string }[]> {
  if (!ANTHROPIC_API_KEY || missing.length === 0) return files;

  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  const sampleFile =
    files.find((f) => f.path.startsWith("components/")) ??
    files.find((f) => f.path.endsWith(".tsx"));

  // Find how each missing component is actually invoked (its JSX call site),
  // so the generated component's props match what the caller passes —
  // otherwise Claude has to guess a prop signature blind and it often
  // mismatches what the rest of the app already expects.
  const usageSnippets = missing
    .map((spec) => {
      const componentName = spec.split("/").pop() ?? spec;
      const JSX_USAGE_RE = new RegExp(`<${componentName}\\b[^>]*/?>`, "g");
      for (const f of files) {
        const m = f.content.match(JSX_USAGE_RE);
        if (m) return `- ${componentName} is called as: ${m[0]}`;
      }
      return null;
    })
    .filter((s): s is string => s !== null);

  const prompt = `This generated Next.js app is missing some files that its own code imports but never actually emitted. Generate ONLY the missing files, in this exact format:

[FILENAME: path/to/file.tsx]
<code>
[/FILENAME]

Missing files (import paths relative to "@/"):
${missing.map((m) => `- ${m}`).join("\n")}

${usageSnippets.length > 0 ? `Match each component's props EXACTLY to how it's actually called elsewhere in the app:\n${usageSnippets.join("\n")}\n` : ""}
${sampleFile ? `For context, here is one existing file from the same app so you match its conventions (styling, TypeScript patterns, Tailwind classes):\n\n[FILENAME: ${sampleFile.path}]\n${sampleFile.content.slice(0, 2000)}\n[/FILENAME]` : ""}

Generate a reasonable, functional implementation for each missing file (a form component for "*Form" imports, a card/row/list component for "*Card"/"*Row" imports, etc). This is Next.js 14 App Router — any component using useState, useEffect, event handlers, or other interactivity MUST start with a "use client"; directive as its very first line, before any imports. Output ONLY the file blocks — no explanations.`;

  const stream = anthropic.messages.stream({
    model: "claude-sonnet-4-6",
    max_tokens: Math.min(4000 * missing.length, 24000),
    messages: [{ role: "user", content: prompt }],
  });

  let text = "";
  for await (const chunk of stream) {
    if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
      text += chunk.delta.text;
    }
  }

  const finalMessage = await stream.finalMessage();
  await logAiUsage({
    source: "app_deploy_repair",
    model: "claude-sonnet-4-6",
    inputTokens: finalMessage.usage.input_tokens,
    outputTokens: finalMessage.usage.output_tokens,
  });
  const repairedFiles = parseGeneratedCode(text).map((f) => {
    const needsClientDirective =
      /\.(tsx|jsx)$/.test(f.path) &&
      !/^\s*["']use client["'];?/.test(f.content) &&
      /\buse(State|Effect|Ref|Context|Reducer|Memo|Callback)\b|on(Click|Change|Submit)=/.test(f.content);
    return needsClientDirective ? { ...f, content: `"use client";\n\n${f.content}` } : f;
  });

  const merged = [...files];
  for (const rf of repairedFiles) {
    if (!merged.some((f) => f.path === rf.path)) merged.push(rf);
  }
  return merged;
}

function patchFiles(files: { path: string; content: string }[]) {
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

  // tailwind.config.ts is platform-owned, like the Supabase client files
  // below — always fully overwritten regardless of what the AI generated.
  // It maps the `primary`/`background` Tailwind theme tokens to CSS
  // variables that app/layout.tsx sets at runtime from site_settings (per
  // SYSTEM_PROMPT rule 13), so this mapping can never be missing or wrong.
  // rgb(var(--x) / <alpha-value>) is the shadcn/ui convention — it requires
  // the CSS variable to hold space-separated RGB components, which is
  // exactly what hexToRgbTriplet() produces for site_settings.*_color_rgb.
  const TAILWIND_CONFIG_CONTENT = `import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: "rgb(var(--color-primary) / <alpha-value>)",
        background: "rgb(var(--color-background) / <alpha-value>)",
      },
    },
  },
  plugins: [],
};
export default config;
`;
  const twIdx = out.findIndex((f) => /^tailwind\.config\.(ts|js|mjs|cjs)$/.test(f.path));
  if (twIdx >= 0) {
    out[twIdx] = { path: "tailwind.config.ts", content: TAILWIND_CONFIG_CONTENT };
  } else {
    out.push({ path: "tailwind.config.ts", content: TAILWIND_CONFIG_CONTENT });
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

  // Same class of gap as missing local imports (findMissingLocalImports
  // below) — the AI occasionally omits package.json entirely from its own
  // output. Unlike a missing component file, this doesn't surface until the
  // Vercel build itself fails at "npm install" with an ENOENT on
  // package.json, so it's worth guaranteeing up front rather than relying on
  // the AI to always emit one. Deps are additive with the lucide-react/
  // tailwindcss patch below, which only runs once this file is guaranteed
  // to exist.
  if (!has("package.json")) {
    out.push({
      path: "package.json",
      content: JSON.stringify(
        {
          name: "vision-workx-app",
          version: "0.1.0",
          private: true,
          scripts: {
            dev: "next dev",
            build: "next build",
            start: "next start",
            lint: "next lint",
          },
          dependencies: {
            "@supabase/ssr": "^0.3.0",
            "@supabase/supabase-js": "^2.39.0",
            next: "14.1.0",
            react: "^18",
            "react-dom": "^18",
          },
          devDependencies: {
            "@types/node": "^20",
            "@types/react": "^18",
            "@types/react-dom": "^18",
            autoprefixer: "^10.0.1",
            eslint: "^8",
            "eslint-config-next": "14.1.0",
            postcss: "^8",
            typescript: "^5",
          },
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

  // Claude occasionally imports the server client from '@/lib/supabase' despite
  // the prompt instructing otherwise — correct the import path deterministically
  // rather than relying on the prompt alone.
  const WRONG_SERVER_IMPORT =
    /import\s+\{([^}]*\bcreateServerSupabaseClient\b[^}]*)\}\s+from\s+['"]@\/lib\/supabase['"]/g;
  out.forEach((f) => {
    if (f.path === "lib/supabase.ts" || f.path === "lib/supabase-server.ts") return;
    f.content = f.content.replace(
      WRONG_SERVER_IMPORT,
      (_match, names) => `import {${names}} from '@/lib/supabase-server'`
    );
  });

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
      // tailwind.config.ts's rgb(var(--x) / <alpha-value>) mapping requires
      // Tailwind v3+ — nothing else in this pipeline pins it.
      pkg.devDependencies = pkg.devDependencies || {};
      if (!pkg.devDependencies["tailwindcss"])
        pkg.devDependencies["tailwindcss"] = "^3.4.0";
      pkgFile.content = JSON.stringify(pkg, null, 2);
    } catch { /* leave as-is */ }
  }

  const envProdIdx = out.findIndex((f) => f.path === ".env.production");
  if (envProdIdx !== -1) out.splice(envProdIdx, 1);

  return out;
}

async function setVercelEnvVars(
  projectId: string,
  schema: string,
  appId: string,
  checkoutSecret: string | null,
) {
  const appOrigin =
    process.env.NEXT_PUBLIC_APP_URL || "https://vision-workx.vercel.app";
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
    // Phase 2 payments: only present once the owner has started Connect
    // onboarding. The generated app calls STRIPE_CHECKOUT_URL server-side
    // with APP_CHECKOUT_SECRET to mint Checkout sessions on their account.
    ...(checkoutSecret
      ? [
          {
            key: "STRIPE_CHECKOUT_URL",
            value: `${appOrigin}/api/apps/${appId}/checkout`,
            type: "plain",
            target: ["production", "preview"],
          },
          {
            key: "APP_CHECKOUT_SECRET",
            value: checkoutSecret,
            type: "encrypted",
            target: ["production", "preview"],
          },
        ]
      : []),
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

// Creates the Vercel project up front (or reuses it on a redeploy) so env
// vars can be set before the build ever starts — NEXT_PUBLIC_* vars are
// baked in at build time, so setting them after a deployment already exists
// only takes effect on a *subsequent* build, which is what used to force a
// second full deployment.
async function getOrCreateVercelProject(name: string): Promise<string> {
  const createRes = await fetch(vercelUrl("/v9/projects"), {
    method: "POST",
    headers: vercelHeaders,
    body: JSON.stringify({ name, framework: "nextjs" }),
  });
  if (createRes.ok) {
    const data = await createRes.json();
    return data.id;
  }
  if (createRes.status === 409) {
    const existing = await vercelGet(`/v9/projects/${name}`);
    return existing.id;
  }
  throw new Error(
    `Vercel project create failed → ${createRes.status}: ${(await createRes.text()).slice(0, 400)}`
  );
}

async function runDeploy(appId: string, userEmail: string | null) {
  const SCHEMA = `app_${appId.slice(0, 8)}`;

  // 1. Fetch app record
  const appRes = await fetch(
    `${SUPABASE_URL}/rest/v1/apps?id=eq.${appId}&select=id,name,user_id,generated_code,status,intake_data,checkout_secret,category,preview_email`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
  );
  const [app] = await appRes.json();
  if (!app?.generated_code) throw new Error("No generated code");

  // 2. Create schema + platform-owned site_settings table, seeded with the
  // logo from intake data if present. Runs unconditionally (independent of
  // whether the AI emitted a migration file) since this table must exist for
  // every tenant, and it's created by our own code — not the AI — so its
  // shape stays stable regardless of what gets generated.
  //
  // The seed write happens in this SAME raw-SQL call, not via a
  // PostgREST-based client afterward — exposeSchemaInPostgREST() below
  // patches the Management API's schema-exposure config, but PostgREST's
  // own schema cache reloads asynchronously, so a PostgREST write against
  // this schema immediately after can fail with "Invalid schema" (PGRST106)
  // before the cache catches up. Using the Management API's direct-SQL path
  // for the seed sidesteps that race entirely.
  //
  // intake.logoPath is client-controlled JSON with no server-side validation
  // elsewhere in the app, so it's validated against LOGO_PATH_RE before ever
  // being interpolated into SQL — the allowed character set excludes quotes,
  // semicolons, and backslashes, so a value that passes is safe to embed.
  // Colors are validated the same way against HEX_COLOR_RE. Unlike logo/
  // social, colors always get seeded with SOME valid value (a UI needs
  // colors to render at all) — falling back to the same defaults already
  // hardcoded elsewhere in this codebase (OnboardForm.tsx, buildUserPrompt).
  const intake = app.intake_data as IntakeData | null;
  const seedLogoUrl =
    intake?.logoPath && LOGO_PATH_RE.test(intake.logoPath)
      ? `${SUPABASE_URL}/storage/v1/object/public/logos/${intake.logoPath}`
      : null;
  const seedPrimaryHex =
    intake?.primaryColor && HEX_COLOR_RE.test(intake.primaryColor)
      ? intake.primaryColor
      : "#1A3A5C";
  const seedBackgroundHex =
    intake?.backgroundColor && HEX_COLOR_RE.test(intake.backgroundColor)
      ? intake.backgroundColor
      : "#F8FAFC";

  const platformSchemaSql = `
CREATE SCHEMA IF NOT EXISTS "${SCHEMA}";

CREATE TABLE IF NOT EXISTS "${SCHEMA}".site_settings (
  id boolean PRIMARY KEY DEFAULT true,
  logo_url text,
  social_links jsonb NOT NULL DEFAULT '{}'::jsonb,
  primary_color text,
  primary_color_rgb text,
  background_color text,
  background_color_rgb text,
  gallery_photos jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT site_settings_singleton CHECK (id)
);

ALTER TABLE "${SCHEMA}".site_settings
  ADD COLUMN IF NOT EXISTS primary_color text,
  ADD COLUMN IF NOT EXISTS primary_color_rgb text,
  ADD COLUMN IF NOT EXISTS background_color text,
  ADD COLUMN IF NOT EXISTS background_color_rgb text,
  ADD COLUMN IF NOT EXISTS gallery_photos jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE "${SCHEMA}".site_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "site_settings: public read" ON "${SCHEMA}".site_settings;
CREATE POLICY "site_settings: public read" ON "${SCHEMA}".site_settings
  FOR SELECT TO anon, authenticated USING (true);

GRANT USAGE ON SCHEMA "${SCHEMA}" TO service_role;
GRANT ALL ON "${SCHEMA}".site_settings TO service_role;
GRANT SELECT ON "${SCHEMA}".site_settings TO anon, authenticated;

INSERT INTO "${SCHEMA}".site_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;
UPDATE "${SCHEMA}".site_settings SET
  logo_url = ${seedLogoUrl ? `'${seedLogoUrl}'` : "logo_url"},
  primary_color = '${seedPrimaryHex}',
  primary_color_rgb = '${hexToRgbTriplet(seedPrimaryHex)}',
  background_color = '${seedBackgroundHex}',
  background_color_rgb = '${hexToRgbTriplet(seedBackgroundHex)}',
  updated_at = now()
WHERE id = true;
`;
  try {
    await supabaseSQL(platformSchemaSql);
  } catch (err) {
    const msg = (err as Error).message;
    if (!msg.includes("already exists")) throw err;
  }

  // 2b. Expose schema in PostgREST before the AI migration runs, so the
  // schema is queryable as soon as possible.
  await exposeSchemaInPostgREST(SCHEMA);

  // 3. Run the AI's migration, if any
  const migrationFile = parseGeneratedCode(app.generated_code).find(
    (f) => f.path.includes("migrations") && f.path.endsWith(".sql")
  );

  if (migrationFile) {
    const migrationSql = migrationFile.content
      .replace(/CREATE EXTENSION IF NOT EXISTS "uuid-ossp";?/g, "")
      .replace(/uuid_generate_v4\(\)/g, "gen_random_uuid()");

    const forbidden = findForbiddenMigrationStatements(migrationSql);
    if (forbidden.length > 0) {
      throw new Error(
        `Generated migration touches shared schemas and was blocked (${forbidden.join(
          ", "
        )}) — this would corrupt platform-wide tables like auth.users. Regenerate the app.`
      );
    }

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

    // 3b. Attach automation-event triggers to every table in the tenant
    // schema, so Revalor Automations can observe row-level changes via
    // public.automation_events. Idempotent (safe on redeploys) and
    // non-fatal — instrumentation must never block a customer's deploy.
    // Excludes site_settings: it's platform config, not business data, and
    // instrumenting it would leak settings-page edits into automation_events.
    try {
      const tables = (await supabaseSQL(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = '${SCHEMA}' AND table_type = 'BASE TABLE' AND table_name != 'site_settings';`
      )) as { table_name: string }[];

      if (tables.length > 0) {
        const triggerSql = tables
          .map(
            ({ table_name }) => `
DROP TRIGGER IF EXISTS emit_automation_event ON "${SCHEMA}"."${table_name}";
CREATE TRIGGER emit_automation_event
  AFTER INSERT OR UPDATE OR DELETE ON "${SCHEMA}"."${table_name}"
  FOR EACH ROW EXECUTE FUNCTION public.emit_automation_event('${appId}');`
          )
          .join("\n");

        await supabaseSQL(triggerSql);
      }
    } catch (err) {
      console.error(
        `[api/deploy] Failed to attach automation triggers for schema ${SCHEMA}:`,
        err
      );
    }
  }

  // 4. Parse + patch files
  const projectName = slugify(app.name, appId);
  const rawFiles = parseGeneratedCode(app.generated_code);
  let files = patchFiles(rawFiles);

  const literalColorHits = findLiteralColorClasses(files);
  if (literalColorHits.length > 0) {
    console.warn(
      `[api/deploy] Literal hex color classes found (rule 13 non-compliance) in ${literalColorHits.length} file(s):`,
      literalColorHits
    );
  }

  // 4b. Detect files referenced but never generated, attempt one focused repair
  let missingImports = findMissingLocalImports(files);
  if (missingImports.length > 0) {
    console.warn(`[api/deploy] Missing files detected, attempting repair: ${missingImports.join(", ")}`);
    files = await repairMissingFiles(files, missingImports);
    missingImports = findMissingLocalImports(files);
    if (missingImports.length > 0) {
      throw new Error(
        `Generated code is incomplete — missing files even after repair attempt: ${missingImports.join(", ")}`
      );
    }
  }

  // 5. Mark deploying
  await supabasePatch("apps", appId, { status: "deploying" });

  // 6. Get or create the Vercel project, then set env vars + disable SSO
  // protection BEFORE the deployment/build is created — NEXT_PUBLIC_* vars
  // must be present at build time, so doing this first means a single
  // deployment's build already has them (no second rebuild needed).
  const vercelProjectId = await getOrCreateVercelProject(projectName);
  await supabasePatch("apps", appId, { vercel_project_id: vercelProjectId }).catch(() => {});
  await setVercelEnvVars(vercelProjectId, SCHEMA, appId, app.checkout_secret ?? null);
  await fetch(vercelUrl(`/v9/projects/${vercelProjectId}`), {
    method: "PATCH",
    headers: vercelHeaders,
    body: JSON.stringify({ ssoProtection: null }),
  });

  // 7. Create the single Vercel deployment
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
  const finalUrl = `https://${deployment.url}`;

  // 8. Poll for READY
  const deadline = Date.now() + 9 * 60 * 1000;
  while (Date.now() < deadline) {
    await delay(8000);
    const status = await vercelGet(`/v13/deployments/${deployId}`);
    if (status.readyState === "READY") break;
    if (status.readyState === "ERROR" || status.readyState === "CANCELED") {
      const logs = await fetchBuildErrors(deployId).catch(() => "");
      throw new BuildError(status.readyState, logs);
    }
  }

  // 9. Save URL + email
  await supabasePatch("apps", appId, {
    deploy_url: finalUrl,
    status: "deployed",
  });

  // Close out this build's revision row (no-op for apps with no open one).
  await finalizeRevision(appId, "deployed", { deployUrl: finalUrl });

  if (RESEND_KEY && userEmail) {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Vision Workx <notifications@notify.revalorllc.com>",
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
  let body: { appId?: string; _internal?: boolean; _repairAttempt?: boolean };
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
    const supabase = await createServerClient();
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
    .select("id, status, name, category, secondary_categories, intake_data")
    .eq("id", appId)
    .single();

  if (!appCheck) {
    return NextResponse.json({ error: "App not found" }, { status: 404 });
  }
  if (appCheck.status === "deployed") {
    return NextResponse.json({ error: "Already deployed" }, { status: 409 });
  }

  // Fetch user email if not already set (internal call path) — email lives on
  // auth.users, not profiles, so it must come through the Admin API.
  if (!userEmail) {
    const { data: appData } = await serviceClient
      .from("apps")
      .select("user_id, preview_email")
      .eq("id", appId)
      .single();
    if (appData?.user_id) {
      const { data: userData } = await serviceClient.auth.admin.getUserById(
        appData.user_id
      );
      userEmail = userData?.user?.email ?? null;
    } else if (appData?.preview_email) {
      // No account yet (Phase 5b preview) — notify the visitor who started it.
      userEmail = appData.preview_email;
    }
  }

  try {
    const url = await runDeploy(appId, userEmail);
    return NextResponse.json({ url });
  } catch (err) {
    // The customer app failed to BUILD (not a pipeline error). If this
    // isn't already a repair attempt, run one repair pass over its source
    // keyed on the compiler errors, then re-trigger a fresh deploy (own
    // time budget). Fresh /api/deploy calls with _repairAttempt never
    // repair again — one shot only.
    if (err instanceof BuildError && err.logs && !body._repairAttempt) {
      console.error("[api/deploy] build failed, repairing:\n", err.logs.slice(0, 800));
      try {
        const { data: srcRow } = await serviceClient
          .from("apps")
          .select("generated_code")
          .eq("id", appId)
          .single();
        const current = parseFileMap(srcRow?.generated_code ?? "");
        if (Object.keys(current).length > 0) {
          const { map: fixed } = await repairGenerated(
            current,
            [
              "The Vercel build of this app FAILED to compile. Fix exactly these errors — re-emit each affected file in full:\n\n" +
                err.logs,
            ],
            {
              appName: appCheck.name,
              category: appCheck.category as AppCategory,
              categories: [
                appCheck.category,
                ...((appCheck.secondary_categories ?? []) as AppCategory[]),
              ],
              features:
                ((appCheck.intake_data as IntakeData | null)?.features ?? []),
            },
          );
          const fixedCode = serializeFileMap(fixed);
          if (fixedCode !== serializeFileMap(current)) {
            await serviceClient
              .from("apps")
              .update({ generated_code: fixedCode, status: "ready" })
              .eq("id", appId);
            const origin = process.env.NEXT_PUBLIC_APP_URL || "https://vision-workx.vercel.app";
            void fetch(`${origin}/api/deploy`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
              body: JSON.stringify({ appId, _internal: true, _repairAttempt: true }),
            }).catch((e) => console.error("[api/deploy] repair redeploy trigger failed:", e));
            return NextResponse.json({ repaired: true, redeploying: true }, { status: 202 });
          }
        }
      } catch (repairErr) {
        console.error("[api/deploy] repair pass failed:", repairErr);
      }
    }

    console.error("[api/deploy]", err);
    try {
      await serviceClient.from("apps").update({ status: "failed" }).eq("id", appId);
    } catch { /* best-effort */ }
    await finalizeRevision(appId, "failed", { error: (err as Error).message });
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
