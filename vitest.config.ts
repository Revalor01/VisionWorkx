import { fileURLToPath } from "url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Mirrors tsconfig.json's "@/*" -> "./*" path mapping. Next.js resolves
    // this itself at build/dev time; Vitest runs standalone and needs it
    // spelled out, which nothing exercised until a test file's import chain
    // first reached a module using an "@/..." import (lib/lifecycle's).
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    // adminSso.ts reads ADMIN_SSO_SECRET into a module-level const at
    // import time, so this must be set before any test file imports it.
    env: {
      ADMIN_SSO_SECRET: "test-secret-do-not-use-in-prod",
    },
  },
});
