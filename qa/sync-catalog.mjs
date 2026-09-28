#!/usr/bin/env node
// Lists every qa() test in qa/products/** and sends the catalog to
// /api/admin/qa/report, so /admin/qa shows new tests without a hand-kept list.
// Run by .github/workflows/qa-run.yml before the tests. Needs QA_REPORT_URL
// and QA_REPORT_SECRET; `--dry` just prints the catalog.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";

const dry = process.argv.includes("--dry");
const out = execFileSync("npx", ["playwright", "test", "--list", "--reporter=json", "-c", "qa/playwright.config.ts"], {
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
  shell: process.platform === "win32",
  env: { ...process.env, QA_REPORT_URL: "", QA_REPORT_SECRET: "" },
});
const report = JSON.parse(out.slice(out.indexOf("{")));

const byProduct = new Map();
function walk(suite) {
  for (const spec of suite.specs ?? []) {
    const tags = (spec.tags ?? []).map((t) => t.replace(/^@/, ""));
    const id = tags.find((t) => /^[a-z0-9-]+\//.test(t));
    if (!id) continue;
    const annotations = spec.tests?.[0]?.annotations ?? [];
    const test = {
      id,
      title: spec.title,
      area: annotations.find((a) => a.type === "area")?.description ?? "General",
      requires: annotations.filter((a) => a.type === "requires").map((a) => a.description),
      tags: tags.filter((t) => t !== id),
    };
    const product = id.split("/")[0];
    if (!byProduct.has(product)) byProduct.set(product, new Map());
    byProduct.get(product).set(id, test);
    // Tests with mobile: true also run on a phone-sized screen, tracked as "<id>--mobile".
    if ((spec.tests ?? []).some((t) => t.projectName === "mobile")) {
      byProduct.get(product).set(`${id}--mobile`, { ...test, id: `${id}--mobile`, title: `${test.title} (phone)`, tags: test.tags.filter((t) => t !== "smoke") });
    }
  }
  for (const child of suite.suites ?? []) walk(child);
}
for (const s of report.suites ?? []) walk(s);

// Manual checks: qa/products/<product>/manual.json -> shown as tick boxes in /admin/qa.
for (const product of readdirSync("qa/products", { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)) {
  const file = `qa/products/${product}/manual.json`;
  if (!existsSync(file)) continue;
  for (const m of JSON.parse(readFileSync(file, "utf8"))) {
    if (!String(m.id).startsWith(`${product}/`)) throw new Error(`${file}: id ${m.id} must start with ${product}/`);
    if (!byProduct.has(product)) byProduct.set(product, new Map());
    byProduct.get(product).set(m.id, { id: m.id, title: m.title, area: m.area ?? "Manual", instructions: m.instructions ?? "", manual: true, tags: [], requires: [] });
  }
}

for (const [product, tests] of byProduct) {
  const list = [...tests.values()];
  if (dry) {
    console.log(product, JSON.stringify(list, null, 2));
    continue;
  }
  const url = process.env.QA_REPORT_URL?.replace(/\/$/, "");
  if (!url || !process.env.QA_REPORT_SECRET) throw new Error("QA_REPORT_URL / QA_REPORT_SECRET not set");
  const res = await fetch(`${url}/api/admin/qa/report`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.QA_REPORT_SECRET}`, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "catalog", product, tests: list }),
  });
  console.log(`catalog ${product}: ${list.length} tests → ${res.status} ${await res.text()}`);
  if (!res.ok) process.exitCode = 1;
}
