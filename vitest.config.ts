import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // adminSso.ts reads ADMIN_SSO_SECRET into a module-level const at
    // import time, so this must be set before any test file imports it.
    env: {
      ADMIN_SSO_SECRET: "test-secret-do-not-use-in-prod",
    },
  },
});
