// Tier 2 of docs/stabilization-plan.md — shrink what the LLM writes.
//
// The generator emits ONLY domain files (migration, app/**, components/**,
// domain lib/** helpers, app/globals.css). Everything scaffold-shaped —
// package.json, tsconfig, next/tailwind/postcss config, the two Supabase
// clients — is platform-owned and comes from templates/base/** (baked into
// baseTemplate.generated.ts). `applyBaseTemplate()` drops any platform-owned
// path the model emitted and lays the canonical version down instead, so
// config/dep drift and the Next-14 clamp stop being a failure surface.

import type { FileMap } from "@/lib/apps/fileMap";
import { BASE_TEMPLATE_FILES } from "@/lib/apps/baseTemplate.generated";

type FileEntry = { path: string; content: string };

/** Paths the generator must NOT own — always replaced by the base template. */
export const PLATFORM_OWNED: ReadonlySet<string> = new Set(
  Object.keys(BASE_TEMPLATE_FILES),
);

/**
 * The only npm packages a generated app may import. Anything else won't be in
 * package.json and the build fails at `npm ci` / module resolution. Keep this
 * in sync with templates/base/package.json `dependencies`.
 */
export const ALLOWED_PACKAGES: readonly string[] = [
  "next",
  "react",
  "react-dom",
  "@supabase/ssr",
  "@supabase/supabase-js",
  "lucide-react",
];

/** True for `@/...` (local alias), `./` and `../` (relative), and Node built-ins. */
function isLocalOrBuiltin(spec: string): boolean {
  return (
    spec.startsWith("@/") ||
    spec.startsWith(".") ||
    spec.startsWith("node:") ||
    spec === "next" ||
    spec.startsWith("next/") ||
    spec.startsWith("react") ||
    spec.startsWith("react-dom")
  );
}

/** The bare package name from an import spec (`@scope/x/y` -> `@scope/x`). */
export function packageOfImport(spec: string): string | null {
  if (isLocalOrBuiltin(spec)) return null;
  const parts = spec.split("/");
  return spec.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

const IMPORT_RE = /\bimport\s+(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']|\brequire\(\s*["']([^"']+)["']\s*\)/g;

/** Non-allowlisted third-party packages imported anywhere in the file set. */
export function disallowedPackages(files: FileEntry[]): string[] {
  const allow = new Set(ALLOWED_PACKAGES);
  const bad = new Set<string>();
  for (const f of files) {
    if (!/\.(tsx?|jsx?|mjs)$/.test(f.path)) continue;
    for (const m of f.content.matchAll(IMPORT_RE)) {
      const pkg = packageOfImport(m[1] ?? m[2] ?? "");
      if (pkg && !allow.has(pkg)) bad.add(pkg);
    }
  }
  return [...bad].sort();
}

/**
 * Lay the base scaffold under the generated domain files. Any platform-owned
 * path the model emitted is discarded; the base version wins. Returns a new
 * array (base files first, then the kept domain files in original order).
 */
export function applyBaseTemplate(files: FileEntry[]): FileEntry[] {
  const kept = files.filter((f) => !PLATFORM_OWNED.has(f.path));
  const base: FileEntry[] = Object.entries(BASE_TEMPLATE_FILES).map(
    ([path, content]) => ({ path, content }),
  );
  return [...base, ...kept];
}

/** FileMap flavour of applyBaseTemplate, for the generate-side pipeline. */
export function applyBaseTemplateToMap(map: FileMap): FileMap {
  const out: FileMap = {};
  for (const [path, content] of Object.entries(map)) {
    if (!PLATFORM_OWNED.has(path)) out[path] = content;
  }
  for (const [path, content] of Object.entries(BASE_TEMPLATE_FILES)) {
    out[path] = content;
  }
  return out;
}
