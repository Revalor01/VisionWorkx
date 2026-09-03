import { existsSync, readFileSync } from "fs";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";
import {
  diffFileMaps,
  mergeFileMap,
  parseFileList,
  parseFileMap,
  serializeFileMap,
} from "./fileMap";

// This module is the bridge between `apps.generated_code` (a text blob) and
// the path→content map every post-generation feature works on. A parse that
// disagrees with app/api/deploy/route.ts by one character means an edit that
// deploys different files than the customer approved, so the round-trip and
// the deploy-parity cases below are the ones that matter.

const SAMPLE = `[FILENAME: package.json]
{
  "name": "acme-booking"
}
[/FILENAME]

[FILENAME: app/page.tsx]
export default function Page() {
  return <main>Book now</main>;
}
[/FILENAME]

[FILENAME: supabase/migrations/001_init.sql]
create table bookings (id uuid primary key default gen_random_uuid());
[/FILENAME]`;

describe("parseFileMap", () => {
  it("pulls every block out as path → trimmed content", () => {
    const map = parseFileMap(SAMPLE);
    expect(Object.keys(map)).toEqual([
      "package.json",
      "app/page.tsx",
      "supabase/migrations/001_init.sql",
    ]);
    expect(map["package.json"]).toBe('{\n  "name": "acme-booking"\n}');
    expect(map["app/page.tsx"]).toContain("Book now");
  });

  it("strips leading slashes from the path, like the deploy route", () => {
    const map = parseFileMap("[FILENAME: /lib/x.ts]\nexport const x = 1;\n[/FILENAME]");
    expect(Object.keys(map)).toEqual(["lib/x.ts"]);
  });

  it("tolerates CRLF line endings", () => {
    const crlf = "[FILENAME: a.ts]\r\nexport const a = 1;\r\n[/FILENAME]";
    expect(parseFileMap(crlf)).toEqual({ "a.ts": "export const a = 1;" });
  });

  it("drops a block with an empty path", () => {
    expect(parseFileMap("[FILENAME:   ]\nnothing\n[/FILENAME]")).toEqual({});
  });

  it("returns {} for a blob with no blocks", () => {
    expect(parseFileMap("just some prose, no file markers")).toEqual({});
  });

  it("last block wins when a path repeats", () => {
    const dup =
      "[FILENAME: a.ts]\nfirst\n[/FILENAME]\n\n[FILENAME: a.ts]\nsecond\n[/FILENAME]";
    expect(parseFileMap(dup)).toEqual({ "a.ts": "second" });
  });

  it("closes a block at the first [/FILENAME] (non-greedy)", () => {
    const nested =
      "[FILENAME: a.ts]\nconst a = 1;\n[/FILENAME]\n\n[FILENAME: b.ts]\nconst b = 2;\n[/FILENAME]";
    expect(parseFileMap(nested)).toEqual({ "a.ts": "const a = 1;", "b.ts": "const b = 2;" });
  });
});

describe("parseFileList", () => {
  it("keeps source order and keeps duplicates as separate entries", () => {
    const dup =
      "[FILENAME: a.ts]\nfirst\n[/FILENAME]\n\n[FILENAME: a.ts]\nsecond\n[/FILENAME]";
    expect(parseFileList(dup)).toEqual([
      { path: "a.ts", content: "first" },
      { path: "a.ts", content: "second" },
    ]);
  });

  it("keeps `]` in a Next.js dynamic-route path instead of dropping the block", () => {
    // Regression: the old `[^\]\r\n]+` path group stopped at the first `]`,
    // so `[FILENAME: app/x/[id]/page.tsx]` failed to match and the file was
    // silently dropped at deploy — every generated app's detail pages 404'd.
    const blob = [
      "[FILENAME: app/dashboard/invoices/[id]/page.tsx]",
      "export default function InvoiceDetail() { return null; }",
      "[/FILENAME]",
      "",
      "[FILENAME: app/portal/quote/[quoteId]/page.tsx]",
      "export default function Q() { return null; }",
      "[/FILENAME]",
      "",
      "[FILENAME: components/Actions.tsx]",
      "export const Actions = () => null;",
      "[/FILENAME]",
    ].join("\n");
    expect(Object.keys(parseFileMap(blob))).toEqual([
      "app/dashboard/invoices/[id]/page.tsx",
      "app/portal/quote/[quoteId]/page.tsx",
      "components/Actions.tsx",
    ]);
  });
});

describe("serializeFileMap ↔ parseFileMap round-trip", () => {
  it("parse ∘ serialize is the identity on a trimmed map", () => {
    const map = {
      "package.json": '{ "name": "x" }',
      "app/page.tsx": "export default function Page() { return null; }",
      "README.md": "# X\n\nline two",
    };
    expect(parseFileMap(serializeFileMap(map))).toEqual(map);
  });

  it("serialize is stable once the blob has been through one parse", () => {
    const once = serializeFileMap(parseFileMap(SAMPLE));
    const twice = serializeFileMap(parseFileMap(once));
    expect(twice).toBe(once);
  });

  it("preserves insertion order in the emitted blob", () => {
    const blob = serializeFileMap({ "z.ts": "1", "a.ts": "2", "m.ts": "3" });
    expect(blob.match(/\[FILENAME: (\S+)\]/g)).toEqual([
      "[FILENAME: z.ts]",
      "[FILENAME: a.ts]",
      "[FILENAME: m.ts]",
    ]);
  });
});

describe("mergeFileMap", () => {
  const base = { "a.ts": "1", "b.ts": "2", "c.ts": "3" };

  it("adds and replaces from the patch, keeps the rest", () => {
    expect(mergeFileMap(base, { "b.ts": "22", "d.ts": "4" })).toEqual({
      "a.ts": "1",
      "b.ts": "22",
      "c.ts": "3",
      "d.ts": "4",
    });
  });

  it("removes deletion paths last", () => {
    expect(mergeFileMap(base, { "d.ts": "4" }, { deletions: ["a.ts", "d.ts"] })).toEqual({
      "b.ts": "2",
      "c.ts": "3",
    });
  });

  it("does not mutate its inputs", () => {
    const patch = { "b.ts": "22" };
    mergeFileMap(base, patch, { deletions: ["c.ts"] });
    expect(base).toEqual({ "a.ts": "1", "b.ts": "2", "c.ts": "3" });
    expect(patch).toEqual({ "b.ts": "22" });
  });
});

describe("diffFileMaps", () => {
  it("reports added and modified paths as changed, and dropped paths as removed", () => {
    const before = { "a.ts": "1", "b.ts": "2", "c.ts": "3" };
    const after = { "a.ts": "1", "b.ts": "CHANGED", "d.ts": "4" };
    expect(diffFileMaps(before, after)).toEqual({
      changed: ["b.ts", "d.ts"],
      removed: ["c.ts"],
    });
  });

  it("is empty for identical maps", () => {
    const m = { "a.ts": "1" };
    expect(diffFileMaps(m, { ...m })).toEqual({ changed: [], removed: [] });
  });
});

// Real-world coverage: the full sunny-day-spa generation sample sitting in
// the repo root. It is not committed and absent in CI, so this is skipped
// there — locally it proves the parser survives a genuine ~100KB blob.
const samplePath = fileURLToPath(new URL("../../sunny-day-spa-generated.txt", import.meta.url));

describe.skipIf(!existsSync(samplePath))("real generation sample", () => {
  const raw = existsSync(samplePath) ? readFileSync(samplePath, "utf8") : "";

  it("parses a plausible number of files, all with non-empty content", () => {
    const map = parseFileMap(raw);
    expect(Object.keys(map).length).toBeGreaterThan(20);
    for (const [path, content] of Object.entries(map)) {
      expect(path).not.toMatch(/^\//);
      expect(content.length).toBeGreaterThan(0);
    }
  });

  it("is stable through serialize → parse → serialize", () => {
    const once = serializeFileMap(parseFileMap(raw));
    expect(serializeFileMap(parseFileMap(once))).toBe(once);
  });

  it("keeps the schema migration reachable the way the deploy route finds it", () => {
    const migration = parseFileList(raw).find((f) =>
      /supabase\/migrations\/.*\.sql$/.test(f.path),
    );
    expect(migration).toBeDefined();
  });
});
