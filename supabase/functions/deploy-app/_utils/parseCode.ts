export interface ParsedFile {
  path: string;
  content: string;
}

const FILE_BLOCK = /\[FILENAME:\s*([^\]\r\n]+)\]\r?\n([\s\S]*?)\[\/FILENAME\]/g;

/**
 * Extracts [FILENAME: ...] / [/FILENAME] blocks produced by the generation prompt.
 * Falls back to a single index.js file if no blocks are found.
 */
export function parseGeneratedCode(raw: string): ParsedFile[] {
  const files: ParsedFile[] = [];
  let match: RegExpExecArray | null;

  FILE_BLOCK.lastIndex = 0;
  while ((match = FILE_BLOCK.exec(raw)) !== null) {
    const path = match[1].trim().replace(/^\/+/, ""); // strip leading slashes
    const content = match[2].trim();
    if (path) files.push({ path, content });
  }

  if (files.length === 0 && raw.trim()) {
    files.push({ path: "index.js", content: raw.trim() });
  }

  return files;
}

/**
 * Ensures the file list has the minimal files Vercel needs to deploy a
 * Next.js project.  Only adds each file if it is not already present.
 */
export function ensureMinimalNextFiles(
  files: ParsedFile[],
  projectName: string
): ParsedFile[] {
  const has = (p: string) => files.some((f) => f.path === p);
  const out = [...files];

  if (!has("package.json")) {
    out.push({
      path: "package.json",
      content: JSON.stringify(
        {
          name: projectName,
          version: "0.1.0",
          private: true,
          scripts: {
            dev: "next dev",
            build: "next build",
            start: "next start",
            lint: "next lint",
          },
          dependencies: {
            next: "14.2.35",
            react: "^18",
            "react-dom": "^18",
            "@supabase/supabase-js": "^2",
            "@supabase/ssr": "^0.5",
            tailwindcss: "^3",
            autoprefixer: "^10",
            postcss: "^8",
          },
          devDependencies: {
            typescript: "^5",
            "@types/react": "^18",
            "@types/react-dom": "^18",
            "@types/node": "^20",
          },
        },
        null,
        2
      ),
    });
  }

  if (!has("next.config.ts") && !has("next.config.mjs") && !has("next.config.js")) {
    out.push({
      path: "next.config.ts",
      content: `import type { NextConfig } from "next";
const nextConfig: NextConfig = {};
export default nextConfig;
`,
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

  return out;
}
