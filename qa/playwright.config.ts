import { defineConfig, devices } from "@playwright/test";

// Revalor QA suite. Run in GitHub Actions by .github/workflows/qa-run.yml
// (started from /admin/qa); results go to /api/admin/qa/report via
// ./reporter.ts. Locally: see docs/qa-suite.md.
//
// Test files are *.qa.ts (not *.spec.ts) so Vitest never picks them up.

const target = process.env.QA_TARGET_URL ?? "https://modules.revalorllc.com";
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET; // protected preview deployments

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
    baseURL: target,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    ...(bypass ? { extraHTTPHeaders: { "x-vercel-protection-bypass": bypass, "x-vercel-set-bypass-cookie": "samesitenone" } } : {}),
  },
  projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"] } }],
});
