import { describe, expect, it } from "vitest";
import {
  ALLOWED_PACKAGES,
  PLATFORM_OWNED,
  applyBaseTemplate,
  applyBaseTemplateToMap,
  disallowedPackages,
  packageOfImport,
} from "./baseTemplate";

// Tier 3 (T3.2) — regression cases for real incidents found this session.

describe("PLATFORM_OWNED / applyBaseTemplate", () => {
  it("discards a model-emitted platform-owned file and lays the base version", () => {
    const out = applyBaseTemplate([
      { path: "package.json", content: '{"name":"evil-override"}' },
      { path: "app/page.tsx", content: "export default function P() {}" },
    ]);
    const pkg = out.find((f) => f.path === "package.json");
    expect(pkg?.content).not.toContain("evil-override");
    expect(out.find((f) => f.path === "app/page.tsx")?.content).toContain("export default");
  });

  it("applyBaseTemplateToMap does the same for the FileMap shape used during generation", () => {
    const out = applyBaseTemplateToMap({
      "tsconfig.json": '{"bogus":true}',
      "app/page.tsx": "ok",
    });
    expect(out["tsconfig.json"]).not.toContain("bogus");
    expect(out["app/page.tsx"]).toBe("ok");
    // every platform path is present even if the model never emitted it
    for (const p of PLATFORM_OWNED) expect(out[p]).toBeDefined();
  });

  it("PLATFORM_OWNED includes both Supabase clients and the Next-14 pin", () => {
    expect(PLATFORM_OWNED.has("lib/supabase.ts")).toBe(true);
    expect(PLATFORM_OWNED.has("lib/supabase-server.ts")).toBe(true);
    expect(PLATFORM_OWNED.has("package.json")).toBe(true);
  });
});

describe("disallowedPackages", () => {
  it("qrcode is allowed (regression: the QR-code intake feature imports it)", () => {
    expect(ALLOWED_PACKAGES).toContain("qrcode");
    const bad = disallowedPackages([
      { path: "lib/qr.ts", content: `import QRCode from "qrcode";` },
    ]);
    expect(bad).toEqual([]);
  });

  it("flags an import of a package that isn't in the base template", () => {
    const bad = disallowedPackages([
      { path: "app/page.tsx", content: `import { format } from "date-fns";` },
    ]);
    expect(bad).toEqual(["date-fns"]);
  });

  it("never flags local (@/), relative, or framework imports", () => {
    const bad = disallowedPackages([
      {
        path: "app/page.tsx",
        content: [
          `import { createClient } from "@/lib/supabase";`,
          `import Header from "../components/Header";`,
          `import Link from "next/link";`,
          `import { useState } from "react";`,
        ].join("\n"),
      },
    ]);
    expect(bad).toEqual([]);
  });

  it("packageOfImport resolves a scoped package to its scope/name, not a subpath", () => {
    expect(packageOfImport("@supabase/supabase-js/dist/module")).toBe("@supabase/supabase-js");
    expect(packageOfImport("lucide-react/icons/check")).toBe("lucide-react");
  });
});
