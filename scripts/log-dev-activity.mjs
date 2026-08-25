/**
 * Vision Workx — Cross-Machine Dev Activity Log
 *
 * Records "who pushed what, from which machine" to Supabase (via the
 * /api/dev-log route) so Claude Code — running on either the Windows or
 * the Mac machine — can tell what the other machine last did.
 *
 * Usage:
 *   node scripts/log-dev-activity.mjs "Fixed billing webhook retry bug"
 *   node scripts/log-dev-activity.mjs --latest [n]     # print last n entries (default 5)
 *
 * Requires in .env.local (gitignored, set separately per machine):
 *   DEV_LOG_SECRET   — shared secret, must match the Vercel env var of the same name
 *   MACHINE_NAME     — e.g. "windows-desktop" or "macbook-pro" (falls back to hostname)
 *   NEXT_PUBLIC_APP_URL — falls back to the production URL below
 */

import { readFileSync } from "fs";
import { execSync } from "child_process";
import { hostname } from "os";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DEFAULT_APP_URL = "https://vision-workx.vercel.app";

function loadEnvLocal() {
  const env = {};
  try {
    const raw = readFileSync(join(ROOT, ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      env[key] = value;
    }
  } catch {
    // .env.local not present — rely on process.env only
  }
  return env;
}

function git(cmd, fallback = null) {
  try {
    return execSync(`git ${cmd}`, { cwd: ROOT, encoding: "utf8" }).trim();
  } catch {
    return fallback;
  }
}

function packageVersion() {
  try {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
    return pkg.version ?? null;
  } catch {
    return null;
  }
}

const fileEnv = loadEnvLocal();
const env = { ...fileEnv, ...process.env };

const APP_URL = env.NEXT_PUBLIC_APP_URL || DEFAULT_APP_URL;
const SECRET = env.DEV_LOG_SECRET;
const MACHINE = env.MACHINE_NAME || hostname();

if (!SECRET) {
  console.error(
    "DEV_LOG_SECRET is not set. Add it to .env.local (must match the DEV_LOG_SECRET set in Vercel)."
  );
  process.exit(1);
}

async function postEntry(summary) {
  const body = {
    machine: MACHINE,
    summary,
    branch: git("rev-parse --abbrev-ref HEAD"),
    commit_sha: git("rev-parse HEAD"),
    version: packageVersion(),
  };

  const res = await fetch(`${APP_URL}/api/dev-log`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${SECRET}` },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    console.error(`Failed to log activity: HTTP ${res.status} — ${await res.text()}`);
    process.exit(1);
  }

  console.log(`Logged (${MACHINE}, ${body.branch}@${body.commit_sha?.slice(0, 7)}): ${summary}`);
}

async function printLatest(n) {
  const res = await fetch(`${APP_URL}/api/dev-log?limit=${n}`, {
    headers: { Authorization: `Bearer ${SECRET}` },
  });

  if (!res.ok) {
    console.error(`Failed to fetch activity: HTTP ${res.status} — ${await res.text()}`);
    process.exit(1);
  }

  const { entries } = await res.json();
  if (!entries?.length) {
    console.log("No dev activity logged yet.");
    return;
  }

  for (const e of entries) {
    const sha = e.commit_sha ? e.commit_sha.slice(0, 7) : "—";
    console.log(`[${e.created_at}] ${e.machine} (${e.branch ?? "?"}@${sha}, v${e.version ?? "?"}): ${e.summary}`);
  }
}

const args = process.argv.slice(2);
if (args[0] === "--latest") {
  const n = Number(args[1]) || 5;
  await printLatest(n);
} else {
  const summary = args.join(" ").trim();
  if (!summary) {
    console.error('Usage: node scripts/log-dev-activity.mjs "summary of what changed"');
    console.error("       node scripts/log-dev-activity.mjs --latest [n]");
    process.exit(1);
  }
  await postEntry(summary);
}
