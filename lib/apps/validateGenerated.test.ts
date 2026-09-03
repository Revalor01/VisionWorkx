import { describe, expect, it } from "vitest";
import { serializeFileMap, type FileMap } from "./fileMap";
import { validateGenerated, validateRawOutput } from "./validateGenerated";

// A minimally-complete generated app that should pass every check.
const OK_MAP: FileMap = {
  "app/layout.tsx": "export default function L({ children }: { children: React.ReactNode }) { return <html><body>{children}</body></html>; }",
  "app/page.tsx": "export default function P() { return <main>home</main>; }",
  ".env.local.example": "NEXT_PUBLIC_SUPABASE_URL=",
  "lib/supabase.ts": "export function createClient() {}",
  "lib/supabase-server.ts": "export function createServerSupabaseClient() {}",
  "supabase/migrations/001_init.sql":
    "create table bookings (id uuid primary key default gen_random_uuid(), customer_email text);\n" +
    "create view vw_metrics_daily as select now()::date as day, 'bookings_created'::text as metric_key, 0::numeric as value;\n" +
    "create view vw_automation_due as select 'x'::text as trigger_type, 'y'::text as ref_id, null::text as recipient_email, null::text as recipient_phone, '{}'::jsonb as context;",
};

describe("validateRawOutput", () => {
  it("passes a well-formed blob", () => {
    expect(validateRawOutput(serializeFileMap(OK_MAP))).toEqual([]);
  });

  it("flags a blob with no file blocks", () => {
    expect(validateRawOutput("I'll build you an app!")).toEqual([
      expect.stringContaining("no [FILENAME:"),
    ]);
  });

  it("flags truncation — blob doesn't end with [/FILENAME]", () => {
    const cut = "[FILENAME: a.ts]\nexport const a = 1;\n[/FILENAME]\n\n[FILENAME: b.tsx]\nexport function B() { return <div className=\"bor";
    expect(validateRawOutput(cut).some((p) => p.includes("cut off"))).toBe(true);
  });

  it("does NOT flag a complete blob whose content mentions the literal [FILENAME:", () => {
    const withReadme = [
      "[FILENAME: README.md]",
      "Files are emitted as `[FILENAME: path]` … `[/FILENAME]` blocks.",
      "[/FILENAME]",
      "",
      "[FILENAME: app/page.tsx]",
      "export default function P() { return null; }",
      "[/FILENAME]",
    ].join("\n");
    expect(validateRawOutput(withReadme)).toEqual([]);
  });

  it("flags a long prose preamble before the first block", () => {
    const withPreamble =
      "Sure! Here is the complete application you asked for, with all files included below.\n\n" +
      "[FILENAME: a.ts]\nexport const a = 1;\n[/FILENAME]";
    expect(validateRawOutput(withPreamble).some((p) => p.includes("prose before"))).toBe(true);
  });
});

describe("validateGenerated", () => {
  const raw = serializeFileMap(OK_MAP);

  it("passes a complete booking app", () => {
    expect(validateGenerated(raw, OK_MAP, "booking")).toEqual([]);
  });

  it("reports a missing required file", () => {
    const { "app/page.tsx": _drop, ...rest } = OK_MAP;
    expect(validateGenerated(serializeFileMap(rest), rest, "booking")).toContain(
      "Missing required file: app/page.tsx",
    );
  });

  it("reports an unresolved @/ import", () => {
    const m = { ...OK_MAP, "app/page.tsx": 'import { X } from "@/lib/nope"; export default function P() { return null; }' };
    expect(
      validateGenerated(serializeFileMap(m), m, "booking").some((p) => p.includes('"@/lib/nope"')),
    ).toBe(true);
  });

  it("reports a missing vw_automation_due view", () => {
    const m = {
      ...OK_MAP,
      "supabase/migrations/001_init.sql":
        "create table x (id uuid primary key);\ncreate view vw_metrics_daily as select 1;",
    };
    expect(
      validateGenerated(serializeFileMap(m), m, "booking").some((p) => p.includes("vw_automation_due")),
    ).toBe(true);
  });

  it("reports a schema-qualified migration statement", () => {
    const m = {
      ...OK_MAP,
      "supabase/migrations/001_init.sql":
        OK_MAP["supabase/migrations/001_init.sql"] + "\ncreate table public.le_hack (id int);",
    };
    expect(
      validateGenerated(serializeFileMap(m), m, "booking").some((p) => p.includes("public./auth.")),
    ).toBe(true);
  });

  it("reports missing payments wiring for an invoicing app", () => {
    expect(
      validateGenerated(raw, OK_MAP, "invoicing").some((p) => p.includes("STRIPE_CHECKOUT_URL")),
    ).toBe(true);
  });

  it("does not require payments wiring for a crm app", () => {
    expect(
      validateGenerated(raw, OK_MAP, "crm").some((p) => p.includes("STRIPE_CHECKOUT_URL")),
    ).toBe(false);
  });

  it("reports literal hex colour classes", () => {
    const m = { ...OK_MAP, "app/page.tsx": 'export default () => <div className="bg-[#1A3A5C]" />;' };
    expect(
      validateGenerated(serializeFileMap(m), m, "booking").some((p) => p.includes("literal hex")),
    ).toBe(true);
  });
});
