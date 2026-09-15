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
    // tenantSchema.ts does the same with these two for the Management API
    // base URL/project ref.
    env: {
      ADMIN_SSO_SECRET: "test-secret-do-not-use-in-prod",
      SUPABASE_MANAGEMENT_TOKEN: "test-mgmt-token-do-not-use-in-prod",
      NEXT_PUBLIC_SUPABASE_URL: "https://test-project.supabase.co",
    },
  },
});
