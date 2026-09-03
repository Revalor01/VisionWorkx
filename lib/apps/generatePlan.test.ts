import { describe, expect, it } from "vitest";
import { __parseFilesSection as parseFilesSection } from "./generatePlan";

describe("parseFilesSection", () => {
  it("pulls file paths out of the ## Files section, stopping at the next heading", () => {
    const plan = [
      "## Files",
      "app/layout.tsx",
      "- app/page.tsx",
      "1. app/dashboard/bookings/[id]/page.tsx",
      "supabase/migrations/001_init.sql",
      "",
      "## Schema",
      "bookings (id uuid, customer_email text)",
    ].join("\n");
    expect(parseFilesSection(plan)).toEqual([
      "app/layout.tsx",
      "app/page.tsx",
      "app/dashboard/bookings/[id]/page.tsx",
      "supabase/migrations/001_init.sql",
    ]);
  });

  it("ignores prose lines that aren't paths", () => {
    const plan = "## Files\nHere are the files:\napp/page.tsx\nAll standard.\n## Schema\n";
    expect(parseFilesSection(plan)).toEqual(["app/page.tsx"]);
  });

  it("returns [] when there is no ## Files section", () => {
    expect(parseFilesSection("## Schema\nfoo (id uuid)")).toEqual([]);
  });

  it("strips a leading slash", () => {
    expect(parseFilesSection("## Files\n/app/page.tsx\n")).toEqual(["app/page.tsx"]);
  });
});
