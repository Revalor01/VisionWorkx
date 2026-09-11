// Phase 6a: catch the common ways a one-shot generation is broken BEFORE
// it's saved and deployed, so a targeted repair pass (lib/apps/repairGenerated)
// can fix them in a cheap Claude call instead of a failed Vercel build — or
// a live app with 404ing pages — 15 seconds later.

import type { AppCategory } from "@/lib/database.types";
import type { FileMap } from "@/lib/apps/fileMap";
import { TEAM_ACCESS_FEATURE } from "@/lib/features";
import {
  PLATFORM_OWNED,
  disallowedPackages,
  ALLOWED_PACKAGES,
} from "@/lib/apps/baseTemplate";

// Categories that CANNOT function without collecting money (unlike booking,
// where a deposit is optional) — so a generated one that never references
// the Checkout bridge is broken.
const PAYMENTS_REQUIRED: readonly AppCategory[] = ["invoicing", "membership", "storefront"];

// package.json / tsconfig / configs / the Supabase clients are platform-owned
// (Tier 2 — lib/apps/baseTemplate). The generator neither needs to emit them
// nor can override them, so nothing here checks for or against them.
const REQUIRED_FILES = ["app/layout.tsx", "app/page.tsx"];

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
  const hasMigration = [...paths].some((p) => /supabase\/migrations\/.*\.sql$/.test(p));
  if (!hasMigration) problems.push("Missing the schema file under supabase/migrations/.");

  // Tier 2 — the model must not import a package that isn't in the base
  // template's package.json (there's nothing for it to add one to, and the
  // build fails at module resolution).
  const bad = disallowedPackages(
    Object.entries(map).map(([path, content]) => ({ path, content })),
  );
  if (bad.length > 0) {
    problems.push(
      `Imports npm package(s) that aren't available: ${bad.join(", ")}. Only these are installed: ${ALLOWED_PACKAGES.join(", ")}. Remove the import or rewrite that code to use only what's available.`,
    );
  }

  // A file written to a platform-owned path is silently discarded at deploy —
  // flag it so the repair pass stops wasting effort on it.
  for (const p of Object.keys(map)) {
    if (PLATFORM_OWNED.has(p)) {
      problems.push(
        `${p} is platform-provided and will be discarded — do not emit it. Move any real logic into a domain file.`,
      );
    }
  }

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

  // Storefront (Stage 1) — the catalogue + cart + orders shape
  if (categories.includes("storefront")) {
    if (hasMigration && !/\bcreate\s+table\s+products\b/i.test(sql)) {
      problems.push("Storefront: the migration has no `products` table — add it (id, name, slug, description, price_cents, active, created_at).");
    }
    if (hasMigration && !/\bcreate\s+table\s+orders\b/i.test(sql)) {
      problems.push("Storefront: the migration has no `orders` table — add it (id, email, items jsonb, subtotal_cents, shipping_cents, total_cents, ship_* fields, status, paid_at).");
    }
    if (!has("app/store/page.tsx")) {
      problems.push("Storefront: app/store/page.tsx (the public product grid) was not generated — create it.");
    }
    const usesUpload = Object.values(map).some((c) => c.includes("PRODUCT_IMAGE_UPLOAD_URL"));
    if (!usesUpload) {
      problems.push("Storefront: nothing references process.env.PRODUCT_IMAGE_UPLOAD_URL — the admin needs a server route that proxies product-image uploads (see the Online store spec).");
    }
    const usesLineItems = Object.values(map).some((c) => /lineItems/.test(c));
    if (!usesLineItems) {
      problems.push("Storefront: the checkout must POST STRIPE_CHECKOUT_URL with a `lineItems` cart, not a single `amount` — nothing uses `lineItems`.");
    }
    // A shopper is the `anon` role (no service key). Without an anon
    // insert policy on `orders`, checkout fails with an RLS error.
    if (hasMigration && /\borders\b/.test(sql) && !/anon[\s\S]{0,400}orders|orders[\s\S]{0,400}anon/i.test(sql)) {
      problems.push("Storefront: `orders` has no policy granting `anon` insert/update — a shopper (anon role) can't place an order. Add: insert to anon+authenticated with check (status='pending'), update to anon+authenticated using (status='pending'), select/delete authenticated only.");
    }
    // auth.users is shared across every store — a plain getUser() check lets
    // any VisionWorkx account into this admin. The layout must gate on the
    // store_settings.admin_emails allowlist.
    const adminLayout = map["app/admin/layout.tsx"];
    if (adminLayout && !/admin_emails/.test(adminLayout)) {
      problems.push("Storefront: app/admin/layout.tsx doesn't check `store_settings.admin_emails` — being logged in isn't enough (auth.users is shared across every store). After getUser(), read admin_emails and redirect('/login?denied=1') if the user's email isn't in it.");
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
