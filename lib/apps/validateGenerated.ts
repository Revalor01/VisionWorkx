// Phase 6a: catch the common ways a one-shot generation is broken BEFORE
// it's saved and deployed, so a targeted repair pass (lib/apps/repairGenerated)
// can fix them in a cheap Claude call instead of a failed Vercel build — or
// a live app with 404ing pages — 15 seconds later.

import type { AppCategory } from "@/lib/database.types";
import type { FileMap } from "@/lib/apps/fileMap";
import { TEAM_ACCESS_FEATURE } from "@/lib/features";

// Categories that CANNOT function without collecting money (unlike booking,
// where a deposit is optional) — so a generated one that never references
// the Checkout bridge is broken.
const PAYMENTS_REQUIRED: readonly AppCategory[] = ["invoicing", "membership"];

const REQUIRED_FILES = ["app/layout.tsx", "app/page.tsx", ".env.local.example"];

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

/** Blob-level problems — a truncated last block never becomes a map entry, */
/* so these need the raw generation output, not the parsed map. */
export function validateRawOutput(raw: string): string[] {
  const problems: string[] = [];
  const firstBlock = raw.indexOf("[FILENAME:");

  if (firstBlock === -1) {
    problems.push("The output contains no [FILENAME: …] blocks at all.");
    return problems;
  }
  // A well-formed generation ends with [/FILENAME]. If it doesn't, the last
  // file is incomplete. We rely on this end-anchor rather than counting
  // markers: a file's own content (a README explaining the format, a
  // template string) can legitimately contain the literal "[FILENAME:",
  // which would make raw counts report phantom truncation.
  if (!raw.trimEnd().endsWith("[/FILENAME]")) {
    problems.push(
      "The output was cut off mid-file — it doesn't end with [/FILENAME]. Re-emit the final file(s) in full.",
    );
  }
  const preamble = raw.slice(0, firstBlock).trim();
  if (preamble.length > 40) {
    problems.push(
      "There is prose before the first [FILENAME: block — output ONLY file blocks, no preamble.",
    );
  }
  return problems;
}

/**
 * Full check: blob-level (truncation, preamble) + map-level (required
 * files, unresolved imports, migration safety, the reporting/automation
 * contracts, payments wiring, literal colours). Empty means it passed.
 * Each string is phrased to go straight into a repair prompt.
 */
export function validateGenerated(
  raw: string,
  map: FileMap,
  category: AppCategory | readonly AppCategory[],
  plannedFiles: string[] = [],
  features: readonly string[] = [],
): string[] {
  const categories = Array.isArray(category)
    ? (category as AppCategory[])
    : [category as AppCategory];
  const problems: string[] = [...validateRawOutput(raw)];
  const paths = new Set(Object.keys(map));
  const has = (p: string) => paths.has(p);

  // Two-pass: a file the plan committed to that never got emitted (and
  // isn't a config file the deploy pipeline fills in) is a silent drop.
  const CONFIG = /^(package\.json|next\.config\.[jt]s|postcss\.config\.js|tailwind\.config\.ts|README\.md|\.env\.local\.example)$/;
  for (const f of plannedFiles) {
    if (!has(f) && !CONFIG.test(f) && /\.(tsx?|sql|css)$/.test(f)) {
      problems.push(`The build plan listed ${f} but it was not generated — create it.`);
    }
  }

  // Required files
  for (const f of REQUIRED_FILES) {
    if (!has(f)) problems.push(`Missing required file: ${f}`);
  }
  for (const [a, b] of REQUIRED_EITHER) {
    if (!has(a) && !has(b)) problems.push(`Missing required file: ${a}`);
  }
  const hasMigration = [...paths].some((p) => /supabase\/migrations\/.*\.sql$/.test(p));
  if (!hasMigration) problems.push("Missing the schema file under supabase/migrations/.");

  // Unresolved local imports
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

  // Migration safety (the multi-tenant rule)
  const sql = migrationSql(map);
  if (FORBIDDEN_MIGRATION.test(sql)) {
    problems.push(
      "The migration has a CREATE/ALTER/DROP qualified with public./auth./storage. — remove the schema qualifier; it runs inside the tenant's own schema.",
    );
  }
  if (/\bon\s+auth\.users\b/i.test(sql) && /\btrigger\b/i.test(sql)) {
    problems.push("The migration defines a trigger on auth.users — forbidden. Insert the profile row from app code instead.");
  }

  // Reporting / automation contracts
  if (hasMigration && !/\bvw_metrics_daily\b/.test(sql)) {
    problems.push("The migration is missing the required `vw_metrics_daily` view (day/metric_key/value).");
  }
  if (hasMigration && !/\bvw_automation_due\b/.test(sql)) {
    problems.push(
      "The migration is missing the required `vw_automation_due` view (trigger_type/ref_id/recipient_email/recipient_phone/context).",
    );
  }

  // Payments wiring for the categories that can't work without it
  if (categories.some((c) => PAYMENTS_REQUIRED.includes(c))) {
    const usesCheckout = Object.values(map).some((c) => c.includes("STRIPE_CHECKOUT_URL"));
    if (!usesCheckout) {
      problems.push(
        "This app collects payments but nothing references process.env.STRIPE_CHECKOUT_URL — wire up the platform Checkout bridge.",
      );
    }
  }

  // Staff logins & team invites (Phase 6c) — only when the owner picked it
  if (features.includes(TEAM_ACCESS_FEATURE)) {
    if (hasMigration && !/\bteam_members\b/.test(sql)) {
      problems.push(
        "Staff logins were requested but the migration has no `team_members` table — add it (id, email, role owner/staff, invite_token, invited_at, joined_at, user_id).",
      );
    }
    if (!has("app/join/page.tsx")) {
      problems.push(
        "Staff logins were requested but app/join/page.tsx (the invite-accept page reading ?token) was not generated — create it.",
      );
    }
    if (!has("app/team/page.tsx")) {
      problems.push(
        "Staff logins were requested but app/team/page.tsx (the owner-only Team management page) was not generated — create it.",
      );
    }
  }

  // Literal hex colours (rule 13) — worst offenders only
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
