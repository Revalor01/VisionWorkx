// Cross-category proving for Tier 1 + Tier 2: run the REAL generation core
// (plan -> implement -> validate -> repair, same as /api/generate, minus the DB
// writes and deploy trigger) for a golden intake, assemble it with the base
// template, and run the sandbox preflight.
//
//   node --import tsx scripts/gen-and-preflight.mjs booking_crm
//   node --import tsx scripts/gen-and-preflight.mjs invoicing portal storefront
//
// Needs .env.local with ANTHROPIC_API_KEY + VERCEL_API_TOKEN. Costs ~1 Claude
// generation per key (+ repair rounds). ~4-8 min each.
import { readFileSync } from "fs";

if (!globalThis.WebSocket) globalThis.WebSocket = (await import("ws")).default;

for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const t = l.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i > 0) process.env[t.slice(0, i).trim()] ||= t.slice(i + 1).trim();
}
process.env.VERCEL_PROJECT_ID ||= "prj_ooqBfMR8QO6TBqaEyQQFM0USSVLx";
process.env.VERCEL_TEAM_ID ||= "team_MO27qs6ulec4Ev0kpSJCeYpd";
process.env.BUILD_PREFLIGHT = "build";

const { default: Anthropic } = await import("@anthropic-ai/sdk");
const { SYSTEM_PROMPT, buildUserPrompt } = await import("../app/api/generate/route.ts");
const { generatePlan } = await import("../lib/apps/generatePlan.ts");
const { validateGenerated } = await import("../lib/apps/validateGenerated.ts");
const { repairGenerated } = await import("../lib/apps/repairGenerated.ts");
const { parseFileMap, serializeFileMap } = await import("../lib/apps/fileMap.ts");
const { applyBaseTemplateToMap } = await import("../lib/apps/baseTemplate.ts");
const { preflightBuild } = await import("../lib/apps/sandboxBuild.ts");

const base = {
  businessType: "Small local business",
  location: "Austin, TX",
  description: "A simple app for a small business — one admin view, one customer view.",
  secondaryCategories: [],
  features: [],
  primaryColor: "#1A3A5C",
  backgroundColor: "#F8FAFC",
  font: "Inter",
};
const GOLDEN = {
  booking: { ...base, category: "booking", businessName: "Canary Coffee", businessType: "Neighborhood coffee shop", description: "Customers book a table online and see opening hours. One admin list of bookings." },
  booking_crm: { ...base, category: "booking", secondaryCategories: ["crm"], businessName: "Canary Salon", businessType: "Hair salon", description: "Online appointment booking plus a simple client list with notes." },
  invoicing: { ...base, category: "invoicing", businessName: "Canary Plumbing", businessType: "Plumbing contractor", description: "Send quotes and invoices, let customers pay online, track what's paid." },
  portal: { ...base, category: "portal", businessName: "Canary Law", businessType: "Small law firm", description: "Clients log in to see case status, share documents, and message us." },
  storefront: { ...base, category: "storefront", businessName: "Canary Candles", businessType: "Small candle maker", description: "Sell about 15 candles online — a photo or two each, one price each. Customers browse, add to cart, enter their address, and pay. One admin screen to add products and mark orders shipped." },
};

const keys = process.argv.slice(2);
if (!keys.length) { console.error("usage: gen-and-preflight.mjs <key...>  (" + Object.keys(GOLDEN).join(" | ") + ")"); process.exit(1); }

const results = [];
for (const key of keys) {
  const intake = GOLDEN[key];
  if (!intake) { console.error(`unknown key: ${key}`); process.exit(1); }
  const categories = [intake.category, ...intake.secondaryCategories];
  console.log(`\n${"=".repeat(64)}\n${key}  —  ${intake.businessName} (${categories.join(" + ")})\n${"=".repeat(64)}`);
  const t0 = Date.now();
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  let planFiles = [];
  let planBlock = "";
  try {
    const plan = await generatePlan(intake, null);
    planFiles = plan.files;
    planBlock = `\n\n## Agreed build plan — implement EXACTLY this, every file, nothing dropped\n${plan.text}\n`;
    console.log(`  plan: ${planFiles.length} files (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  } catch (e) {
    console.log(`  plan pass failed, continuing: ${e.message}`);
  }

  let full = "";
  const stream = anthropic.messages.stream({
    model: "claude-sonnet-4-6",
    max_tokens: 64000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserPrompt(intake) + planBlock }],
  });
  for await (const c of stream) {
    if (c.type === "content_block_delta" && c.delta.type === "text_delta") full += c.delta.text;
  }
  await stream.finalMessage();
  let map = parseFileMap(full);
  console.log(`  generated: ${Object.keys(map).length} files (${((Date.now() - t0) / 1000).toFixed(0)}s)`);

  const problems = validateGenerated(full, map, categories, planFiles, intake.features);
  if (problems.length) {
    console.log(`  validate: ${problems.length} problem(s) -> repair`);
    const { map: fixed } = await repairGenerated(map, problems, {
      appName: intake.businessName, category: intake.category, categories,
      plannedFiles: planFiles, features: intake.features, appId: null,
    });
    map = fixed;
  }

  const files = applyBaseTemplateToMap(map);
  const outcome = await preflightBuild(files, {
    maxIterations: 4,
    onLog: (l) => console.log(`  [preflight] ${l}`),
    repair: async (fm, errors) => {
      const { map: m } = await repairGenerated(
        fm,
        ["The production `next build` FAILED. Fix exactly these errors and re-emit each affected file IN FULL.\n\n" + errors],
        { appName: intake.businessName, category: intake.category, categories, features: intake.features, appId: null },
      );
      return m;
    },
  });

  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  const verdict = outcome.ok === true ? `PASS (iter ${outcome.iterations}${outcome.repaired ? ", repaired" : ""})`
    : outcome.ok === "skipped" ? `SKIPPED (${outcome.reason})`
    : `FAIL @ ${outcome.stage} after ${outcome.iterations}`;
  console.log(`\n  >>> ${key}: ${verdict}  [${secs}s]`);
  if (outcome.ok === false) console.log(outcome.errors.slice(0, 1200));
  results.push({ key, verdict, secs });
}

console.log(`\n${"=".repeat(64)}\nSUMMARY`);
for (const r of results) console.log(`  ${r.key.padEnd(14)} ${r.verdict}   ${r.secs}s`);
process.exit(results.every((r) => r.verdict.startsWith("PASS") || r.verdict.startsWith("SKIP")) ? 0 : 1);
