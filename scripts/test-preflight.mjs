// Tier 1 validation — run the real preflightBuild() against a real generated
// app, with a real repairGenerated() callback. Confirms the sandbox loop works
// in your Vercel environment BEFORE flipping BUILD_PREFLIGHT=build in prod.
//
//   node --import tsx scripts/test-preflight.mjs                       # ./sunny-day-spa-generated.txt
//   node --import tsx scripts/test-preflight.mjs <appId|name-substring> # from the DB
//
// Requires .env.local with VERCEL_API_TOKEN, ANTHROPIC_API_KEY, and (for the
// DB path) SUPABASE_MANAGEMENT_TOKEN + NEXT_PUBLIC_SUPABASE_URL.
import { readFileSync, existsSync } from "fs";

// Local Node < 22 has no native WebSocket; @supabase/supabase-js (pulled in
// transitively by repairGenerated -> logAiUsage) needs one. Not needed in the
// Vercel runtime (Node 24). Test-only.
if (!globalThis.WebSocket) {
  globalThis.WebSocket = (await import("ws")).default;
}

const env = {};
for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const t = l.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i > 0) process.env[t.slice(0, i).trim()] ||= t.slice(i + 1).trim(), (env[t.slice(0, i).trim()] = t.slice(i + 1).trim());
}
// VERCEL_PROJECT_ID isn't in .env.local; the sandbox needs it with the token.
process.env.VERCEL_PROJECT_ID ||= "prj_ooqBfMR8QO6TBqaEyQQFM0USSVLx";
process.env.VERCEL_TEAM_ID ||= "team_MO27qs6ulec4Ev0kpSJCeYpd";
process.env.BUILD_PREFLIGHT = "build";

const { preflightBuild } = await import("../lib/apps/sandboxBuild.ts");
const { repairGenerated } = await import("../lib/apps/repairGenerated.ts");
const { parseFileMap } = await import("../lib/apps/fileMap.ts");

const arg = process.argv[2];
let blob;
let appName = "Sunny Day Spa";
let category = "booking";

if (!arg && existsSync(new URL("../sunny-day-spa-generated.txt", import.meta.url))) {
  blob = readFileSync(new URL("../sunny-day-spa-generated.txt", import.meta.url), "utf8");
} else if (arg) {
  const REF = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
  const q = async (sql) =>
    (await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.SUPABASE_MANAGEMENT_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: sql }),
    })).json();
  const like = arg.replace(/'/g, "''");
  const [row] = await q(
    `select name, category, coalesce(pending_generated_code, generated_code) as code
     from public.apps where id::text like '${like}%' or name ilike '%${like}%' limit 1`,
  );
  if (!row?.code) { console.error("no app / no code for", arg); process.exit(1); }
  blob = row.code;
  appName = row.name;
  category = row.category;
} else {
  console.error("no ./sunny-day-spa-generated.txt and no arg given");
  process.exit(1);
}

const files = parseFileMap(blob);

// Minimal slice of patchFiles(): the deploy route injects these when the AI
// omits them, and without tsconfig the "@/*" alias doesn't resolve.
if (!files["tsconfig.json"]) {
  files["tsconfig.json"] = JSON.stringify(
    {
      compilerOptions: {
        target: "ES2017", lib: ["dom", "dom.iterable", "esnext"], allowJs: true,
        skipLibCheck: true, strict: true, noEmit: true, esModuleInterop: true,
        module: "esnext", moduleResolution: "bundler", resolveJsonModule: true,
        isolatedModules: true, jsx: "preserve", incremental: true,
        plugins: [{ name: "next" }], paths: { "@/*": ["./*"] },
      },
      include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
      exclude: ["node_modules"],
    },
    null, 2,
  );
}
if (!files["next.config.mjs"] && !files["next.config.js"]) {
  files["next.config.mjs"] = "const nextConfig = { typescript: { ignoreBuildErrors: false } };\nexport default nextConfig;\n";
}
if (!files["next-env.d.ts"]) {
  files["next-env.d.ts"] = '/// <reference types="next" />\n/// <reference types="next/image-types/global" />\n';
}

console.log(`app: ${appName} (${category}) — ${Object.keys(files).length} files\n`);

const t0 = Date.now();
const outcome = await preflightBuild(files, {
  maxIterations: 4,
  onLog: (l) => console.log(`  [preflight] ${l}`),
  repair: async (fm, errors) => {
    console.log(`  [repair] calling repairGenerated with ${errors.length} chars of build errors…`);
    const { map, rounds } = await repairGenerated(
      fm,
      ["The production `next build` FAILED. Fix exactly these errors and re-emit each affected file IN FULL. Do not change package.json framework pins.\n\n" + errors],
      { appName, category, categories: [category], features: [], appId: null },
    );
    console.log(`  [repair] done (${rounds} round(s))`);
    return map;
  },
});

console.log(`\n=== outcome after ${((Date.now() - t0) / 1000).toFixed(1)}s ===`);
console.log(JSON.stringify(
  outcome.ok === true
    ? { ok: true, iterations: outcome.iterations, repaired: outcome.repaired }
    : outcome.ok === false
      ? { ok: false, stage: outcome.stage, iterations: outcome.iterations, errors: outcome.errors.slice(0, 1500) }
      : outcome,
  null, 2,
));
process.exit(outcome.ok === true || outcome.ok === "skipped" ? 0 : 1);
