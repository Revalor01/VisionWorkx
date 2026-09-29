import { defineConfig, devices } from "@playwright/test";

// Revalor QA suite. Run in GitHub Actions by .github/workflows/qa-run.yml
// (started from /admin/qa or nightly); results go to /api/admin/qa/report via
// ./reporter.ts. Locally: see docs/qa-suite.md.
//
// One pair of projects per product (desktop + "<product>-mobile"), each with
// its own tests folder and production URL. QA_PRODUCT limits a run to one
// product; QA_TARGET_URL points that product at another deployment (a preview).
//
// Test files are *.qa.ts (not *.spec.ts) so Vitest never picks them up.

import { PRODUCTS, targetFor } from "./products";

const only = process.env.QA_PRODUCT || "";
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET; // protected preview deployments
const baseURL = targetFor;

export default defineConfig({
  testDir: "./products",
  testMatch: "**/*.qa.ts",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : 1,
  globalSetup: "./global-setup.ts",
  reporter: [["list"], ["./reporter.ts"]],
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    ...(bypass ? { extraHTTPHeaders: { "x-vercel-protection-bypass": bypass, "x-vercel-set-bypass-cookie": "samesitenone" } } : {}),
  },
  projects: Object.keys(PRODUCTS)
    .filter((p) => !only || p === only)
    .flatMap((p) => [
      { name: p, testDir: `./products/${p}`, use: { ...devices["Desktop Chrome"], baseURL: baseURL(p) } },
      // Tests declared with mobile: true run again on a phone-sized screen (Chromium, so no extra browser install).
      { name: `${p}-mobile`, testDir: `./products/${p}`, grep: /@mobile/, use: { ...devices["Pixel 7"], baseURL: baseURL(p) } },
    ]),
});
