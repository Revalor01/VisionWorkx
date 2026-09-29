#!/usr/bin/env node
// Sync the offline Revalor Needs Analyzer (the laptop app) up to the online copy at
// /admin/needs-analyzer. Run it on the laptop once you're back online.
//
//   node needs-analyzer-sync.mjs [analyzer-folder] [--settings] [--dry-run] [--url <site>]
//
//   analyzer-folder  the unzipped revalor-needs-analyzer folder (default: current folder)
//   --settings       also replace the online catalog & pricing and ecosystem with the laptop's
//   --dry-run        show what would be sent, send nothing
//   --url            default https://vision-workx.vercel.app
//
// The secret (Vercel env NEEDS_ANALYZER_SYNC_SECRET) comes from the
// NEEDS_ANALYZER_SYNC_SECRET environment variable, or the first line of
// ~/.needs-analyzer-sync-secret. Keep it out of the analyzer folder so it never
// gets zipped up with it.
//
// Nothing on the laptop is changed. Each assessment is matched by its offline id:
// new ones are added, ones changed only on the laptop are updated, and anything
// edited online since the last sync is kept and listed (never overwritten).
// Standalone on purpose (Node 18+, no packages) so it can be copied next to the app.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const positional = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--url");
const folder = path.resolve(positional[0] || ".");
const site = opt("--url", "https://vision-workx.vercel.app").replace(/\/+$/, "");
const dryRun = flag("--dry-run");

function fail(msg) {
  console.error(`\n  ${msg}\n`);
  process.exit(1);
}

const dataDir = path.join(folder, "data");
const assessDir = path.join(dataDir, "assessments");
if (!fs.existsSync(assessDir)) fail(`No data/assessments folder in ${folder}. Pass the Needs Analyzer folder, e.g.:\n  node needs-analyzer-sync.mjs ~/Documents/revalor-needs-analyzer`);

const assessments = [];
const unreadable = [];
for (const f of fs.readdirSync(assessDir).filter((x) => x.endsWith(".json"))) {
  try {
    assessments.push(JSON.parse(fs.readFileSync(path.join(assessDir, f), "utf8")));
  } catch {
    unreadable.push(f);
  }
}

const body = { assessments };
if (flag("--settings")) {
  for (const key of ["catalog", "ecosystem"]) {
    const file = path.join(dataDir, `${key}.json`);
    if (fs.existsSync(file)) body[key] = JSON.parse(fs.readFileSync(file, "utf8"));
  }
}

console.log(`\n  Needs Analyzer sync -> ${site}`);
console.log(`  ${assessments.length} assessment(s)${body.catalog ? " + catalog" : ""}${body.ecosystem ? " + ecosystem" : ""} from ${folder}`);
if (unreadable.length) console.log(`  Skipped unreadable files: ${unreadable.join(", ")}`);
if (dryRun) {
  for (const a of assessments) console.log(`   - ${a.answers?.bizName || "Untitled business"}  (${a.id}, updated ${a.updatedAt})`);
  console.log("\n  Dry run: nothing sent.\n");
  process.exit(0);
}

let secret = process.env.NEEDS_ANALYZER_SYNC_SECRET;
if (!secret) {
  const file = path.join(os.homedir(), ".needs-analyzer-sync-secret");
  if (fs.existsSync(file)) secret = fs.readFileSync(file, "utf8").split(/\r?\n/)[0].trim();
}
if (!secret) fail("No sync secret. Set NEEDS_ANALYZER_SYNC_SECRET or put it in ~/.needs-analyzer-sync-secret");

let res;
try {
  res = await fetch(`${site}/api/needs-analyzer/sync`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${secret}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
} catch (e) {
  fail(`Couldn't reach ${site} (${e.message}). Check the internet connection and try again.`);
}
if (res.status === 401) fail("The sync secret was rejected. Check it matches NEEDS_ANALYZER_SYNC_SECRET in Vercel.");
if (!res.ok) fail(`Sync failed: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
const out = await res.json();

const LABEL = {
  insert: "added",
  update: "updated",
  unchanged: "already up to date",
  "online-newer": "changed online since the last sync (laptop copy is older; left as is)",
  conflict: "changed in BOTH places (kept the online copy; re-enter laptop changes online)",
  "deleted-online": "deleted online (not re-added)",
  failed: "FAILED to save, try again",
};
const groups = {};
for (const r of out.results) (groups[r.action] ||= []).push(r);
console.log("");
for (const action of Object.keys(LABEL)) {
  const list = groups[action];
  if (!list?.length) continue;
  console.log(`  ${list.length} ${LABEL[action]}:`);
  for (const r of list) console.log(`     - ${r.bizName}`);
}
if (out.invalid) console.log(`  ${out.invalid} file(s) weren't valid assessments and were skipped`);
for (const [key, status] of Object.entries(out.settings || {})) console.log(`  ${key}: ${status}`);
console.log(`\n  Open ${site}/admin/needs-analyzer\n`);
if (groups.failed?.length) process.exit(1);
