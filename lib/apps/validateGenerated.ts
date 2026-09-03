// Phase 6a: catch the common ways a one-shot generation is broken BEFORE
// it's saved and deployed, so a targeted repair pass can fix them in a
// cheap Claude call instead of a failed Vercel build 15 seconds later.

import type { AppCategory } from "@/lib/database.types";
import { categoryTakesPayments } from "@/lib/apps/payments";
import type { FileMap } from "@/lib/apps/fileMap";

const REQUIRED_FILES = [
  "app/layout.tsx",
  "app/page.tsx",
  ".env.local.example",
];

// One of each pair must exist (the generator has used both names historically).
const REQUIRED_EITHER: [string, string][] = [
  ["lib/supabase.ts", "lib/supabase-browser.ts"],
  ["lib/supabase-server.ts", "lib/supabaseServer.ts"],
];

const IMPORT_RE = /from\s+["']@\/([^"']+)["']/g;
const HEX_CLASS_RE = /\b(?:bg|text|border|ring|from|via|to|fill|stroke)-\[#[0-9a-fA-F]{3,8}\]/;
const FORBIDDEN_MIGRATION =
  /\b(create|alter|drop)\s+(table|view|function|trigger|policy|type|index|schema)\s+(if\s+(not\s+)?exists\s+)?(public|auth|storage)\./i;

function isCode(path: string): boolean {
  return /\.(tsx?|jsx?)$/.test(path);
}

function migrationSql(map: FileMap): string {
  return Object.entries(map)
    .filter(([p]) => /supabase\/migrations\/.*\.sql$/.test(p))
    .map(([, c]) => c)
    .join("\n");
}

/**
 * Return a list of concrete problems with a generated file map. Empty means
 * it passed. Each string is phrased so it can go straight into a repair
 * prompt.
 */
export function validateGenerated(map: FileMap, category: AppCategory): string[] {
  const problems: string[] = [];
  const paths = new Set(Object.keys(map));
  const has = (p: string) => paths.has(p);

  // 1. Required files
  for (const f of REQUIRED_FILES) {
    if (!has(f)) problems.push(`Missing required file: ${f}`);
  }
  for (const [a, b] of REQUIRED_EITHER) {
    if (!has(a) && !has(b)) problems.push(`Missing required file: ${a}`);
  }
  const hasMigration = [...paths].some((p) => /supabase\/migrations\/.*\.sql$/.test(p));
  if (!hasMigration) problems.push("Missing the schema file under supabase/migrations/.");

  // 2. Unresolved local imports
  const resolvable = (spec: string) =>
    [spec, `${spec}.ts`, `${spec}.tsx`, `${spec}/index.ts`, `${spec}/index.tsx`].some(has);
  const missing = new Set<string>();
  for (const [p, content] of Object.entries(map)) {
    if (!isCode(p)) continue;
    for (const m of content.matchAll(IMPORT_RE)) {
      if (!resolvable(m[1])) missing.add(m[1]);
    }
  }
  for (const m of missing) {
    problems.push(`A file imports "@/${m}" but no such file was generated — create it or fix the import.`);
  }

  // 3. Truncation — a file block that never closed usually means the
  //    generation was cut off mid-stream.
  for (const [p, content] of Object.entries(map)) {
    if (content.includes("[FILENAME:") || content.trimEnd().endsWith("[/FILENAME")) {
      problems.push(`File ${p} looks truncated (contains a stray file marker) — regenerate it in full.`);
    }
  }

  // 4. Migration safety (the multi-tenant rule)
  const sql = migrationSql(map);
  if (FORBIDDEN_MIGRATION.test(sql)) {
    problems.push(
      "The migration has a CREATE/ALTER/DROP qualified with public./auth./storage. — remove the schema qualifier; the migration runs inside the tenant's own schema.",
    );
  }
  if (/\bon\s+auth\.users\b/i.test(sql) && /\btrigger\b/i.test(sql)) {
    problems.push("The migration defines a trigger on auth.users — forbidden. Insert the profile row from app code instead.");
  }

  // 5. Reporting contracts (Phase 3/4)
  if (hasMigration && !/\bvw_metrics_daily\b/.test(sql)) {
    problems.push("The migration is missing the required `vw_metrics_daily` view (day/metric_key/value).");
  }
  if (hasMigration && !/\bvw_automation_due\b/.test(sql)) {
    problems.push(
      "The migration is missing the required `vw_automation_due` view (trigger_type/ref_id/recipient_email/recipient_phone/context).",
    );
  }

  // 6. Payments wiring for the categories that need it
  if (categoryTakesPayments(category)) {
    const usesCheckout = Object.values(map).some((c) => c.includes("STRIPE_CHECKOUT_URL"));
    if (!usesCheckout) {
      problems.push(
        "This app collects payments but nothing references process.env.STRIPE_CHECKOUT_URL — wire up the platform Checkout bridge.",
      );
    }
  }

  // 7. Literal hex colours (rule 13) — report the worst offenders only.
  const hexFiles = Object.entries(map)
    .filter(([p, c]) => isCode(p) && HEX_CLASS_RE.test(c))
    .map(([p]) => p);
  if (hexFiles.length > 0) {
    problems.push(
      `These files use literal hex colour classes (e.g. bg-[#...]) instead of the primary/background theme tokens: ${hexFiles.slice(0, 6).join(", ")}.`,
    );
  }

  return problems;
}
