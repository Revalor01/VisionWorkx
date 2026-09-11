// Tier 1 of docs/stabilization-plan.md — build the generated app in an
// ephemeral Vercel Sandbox and repair it against the REAL `next build`
// compiler output BEFORE a Vercel project is ever created.
//
// Why: the old flow deployed straight to a fresh Vercel project and only
// learned the build was broken minutes later, with the repair loop limited to
// ~2 slow remote attempts. A sandbox `npm install` + `next build` is ~25-40s
// and each repair→rebuild after that is seconds, so we get 4+ fast iterations
// and only a green build gets deployed.
//
// Semantics:
//   ok: true      — the (possibly repaired) files compile; deploy them.
//   ok: false     — install or build still broken after the repair budget;
//                   the caller must NOT create a Vercel project.
//   ok: "skipped" — our sandbox infra is unavailable (or BUILD_PREFLIGHT=off).
//                   Fall through to the normal deploy; the Vercel build is
//                   still the backstop. Never block a customer on our infra.

import { Sandbox } from "@vercel/sandbox";
import type { FileMap } from "@/lib/apps/fileMap";

export type PreflightOutcome =
  | { ok: true; files: FileMap; iterations: number; repaired: boolean }
  | { ok: false; stage: "install" | "build"; errors: string; iterations: number; files: FileMap }
  | { ok: "skipped"; reason: string };

export interface PreflightOpts {
  /** Given the current files + the raw build error text, return repaired files. */
  repair: (files: FileMap, buildErrors: string) => Promise<FileMap>;
  /** Repair→rebuild attempts after the first build (default 4). */
  maxIterations?: number;
  onLog?: (line: string) => void;
}

// NEXT_PUBLIC_* must be defined at build time or `next build` throws while
// evaluating the Supabase client module. Placeholders are fine — pages that
// read live data are `force-dynamic` and don't run at build.
const BUILD_ENV: Record<string, string> = {
  NEXT_PUBLIC_SUPABASE_URL: "https://placeholder.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "placeholder-anon-key",
  NEXT_TELEMETRY_DISABLED: "1",
  CI: "1",
};

const mode = () => (process.env.BUILD_PREFLIGHT ?? "build").toLowerCase();
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Pass explicit creds only if the whole set is present (the SDK rejects a
 * partial set); otherwise rely on the Vercel runtime's OIDC context. */
async function createSandbox(): Promise<Sandbox> {
  const token = process.env.VERCEL_API_TOKEN;
  const teamId = process.env.VERCEL_TEAM_ID;
  const projectId = process.env.VERCEL_PROJECT_ID;
  const creds =
    token && teamId && projectId ? { token, teamId, projectId } : {};
  return Sandbox.create({
    runtime: "node22",
    timeout: 300_000,
    resources: { vcpus: 4 },
    ...creds,
  });
}

function toWrites(files: FileMap): { path: string; content: Buffer }[] {
  return Object.entries(files).map(([path, content]) => ({
    path,
    content: Buffer.from(content, "utf8"),
  }));
}

/** Trim a Next build log to the part that matters for a repair prompt. */
function extractBuildErrors(raw: string): string {
  const marker = raw.search(/Failed to compile|Type error:|Module not found|Error:/);
  const body = marker >= 0 ? raw.slice(marker) : raw;
  return body.length > 6000 ? body.slice(0, 6000) + "\n…(truncated)" : body;
}

export async function preflightBuild(
  input: FileMap,
  opts: PreflightOpts,
): Promise<PreflightOutcome> {
  if (mode() === "off") return { ok: "skipped", reason: "BUILD_PREFLIGHT=off" };

  const log = opts.onLog ?? (() => {});
  const maxIter = opts.maxIterations ?? 4;

  let sandbox: Sandbox;
  try {
    sandbox = await createSandbox();
  } catch (err) {
    return { ok: "skipped", reason: `sandbox create failed: ${msg(err)}` };
  }

  let files = input;
  try {
    await sandbox.writeFiles(toWrites(files));

    const install = await sandbox.runCommand({
      cmd: "npm",
      args: ["install", "--no-audit", "--no-fund", "--loglevel=error"],
      env: BUILD_ENV,
    });
    if (install.exitCode !== 0) {
      return {
        ok: false,
        stage: "install",
        errors: extractBuildErrors(await install.output("both")),
        iterations: 0,
        files,
      };
    }

    let repaired = false;
    for (let i = 1; i <= maxIter + 1; i++) {
      const build = await sandbox.runCommand({
        cmd: "npx",
        args: ["--yes", "next", "build"],
        env: BUILD_ENV,
      });
      if (build.exitCode === 0) {
        log(`preflight green on attempt ${i}${repaired ? " (after repair)" : ""}`);
        return { ok: true, files, iterations: i, repaired };
      }

      const errors = extractBuildErrors(await build.output("both"));
      log(`preflight build attempt ${i} failed`);
      if (i > maxIter) {
        return { ok: false, stage: "build", errors, iterations: i, files };
      }

      const before = files;
      try {
        files = await opts.repair(before, errors);
      } catch (err) {
        // Repair itself broke (e.g. Anthropic unavailable). Bail to the normal
        // deploy — its own repair pass is the backstop — rather than fail the
        // customer's build here.
        return { ok: "skipped", reason: `repair callback failed: ${msg(err)}` };
      }
      repaired = true;
      const changed = Object.keys(files).filter(
        (p) => files[p] !== before[p],
      );
      const removed = Object.keys(before).filter((p) => !(p in files));
      if (changed.length === 0 && removed.length === 0) {
        log("repair produced no changes — giving up");
        return { ok: false, stage: "build", errors, iterations: i, files };
      }
      // Re-sync the sandbox: rewrite changed files, delete removed ones.
      if (changed.length) {
        await sandbox.writeFiles(
          toWrites(Object.fromEntries(changed.map((p) => [p, files[p]]))),
        );
      }
      for (const p of removed) {
        await sandbox.runCommand({ cmd: "rm", args: ["-f", p] }).catch(() => {});
      }
    }
    // loop always returns
    return { ok: false, stage: "build", errors: "exhausted", iterations: maxIter, files };
  } catch (err) {
    // Infra failure mid-run — don't fail the customer's build over it.
    return { ok: "skipped", reason: `sandbox error: ${msg(err)}` };
  } finally {
    await sandbox.stop().catch(() => {});
  }
}
