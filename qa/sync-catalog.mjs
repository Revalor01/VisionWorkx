#!/usr/bin/env node
// Lists every qa() test in qa/products/** and sends the catalog to
// /api/admin/qa/report, so /admin/qa shows new tests without a hand-kept list.
// Run by .github/workflows/qa-run.yml before the tests. Needs QA_REPORT_URL
// and QA_REPORT_SECRET; `--dry` just prints the catalog.
import { execFileSync } from "node:child_process";

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
  }
  for (const child of suite.suites ?? []) walk(child);
}
for (const s of report.suites ?? []) walk(s);

for (const [product, tests] of byProduct) {
  const list = [...tests.values()];
  if (dry) {
    console.log(product, JSON.stringify(list, null, 2));
    continue;
  }
  const url = process.env.QA_REPORT_URL?.replace(/\/$/, "");
  // Stray byte-order marks / line breaks (e.g. from piping a secret through PowerShell) would break the header.
  const secret = (process.env.QA_REPORT_SECRET ?? "").replace(/[﻿\s]/g, "");
  if (!url || !secret) throw new Error("QA_REPORT_URL / QA_REPORT_SECRET not set");
  const res = await fetch(`${url}/api/admin/qa/report`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "catalog", product, tests: list }),
  });
  console.log(`catalog ${product}: ${list.length} tests → ${res.status} ${await res.text()}`);
  if (!res.ok) process.exitCode = 1;
}
