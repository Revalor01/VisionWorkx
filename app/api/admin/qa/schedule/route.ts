import { NextRequest, NextResponse } from "next/server";
import { isOperator } from "@/lib/modules/adminGuard";
import { ADMIN_EMAIL } from "@/lib/adminSso";
import { qaDb } from "@/lib/qa/db";
import { GLOBAL_SLUG, isCadence, isProductCadence } from "@/lib/qa/schedule";
import { PRODUCT_RE } from "@/lib/qa/summary";

// Operator saves the QA testing schedule from /admin/qa: the global default
// cadence and any per-product overrides, into vw_qa_schedule (service-role).
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (origin && origin !== req.nextUrl.origin) return NextResponse.json({ error: "Bad origin" }, { status: 403 });
  if (!(await isOperator())) return NextResponse.json({ error: "Not allowed" }, { status: 403 });

  let body: { global?: unknown; products?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const rows: { product_slug: string; cadence: string; updated_by: string; updated_at: string }[] = [];

  if (body.global !== undefined) {
    // The global default must be a concrete cadence, never "default".
    if (!isCadence(body.global)) return NextResponse.json({ error: "Pick a global cadence." }, { status: 400 });
    rows.push({ product_slug: GLOBAL_SLUG, cadence: body.global, updated_by: ADMIN_EMAIL, updated_at: now });
  }

  if (body.products !== undefined) {
    if (typeof body.products !== "object" || body.products === null) {
      return NextResponse.json({ error: "Invalid products." }, { status: 400 });
    }
    for (const [slug, cadence] of Object.entries(body.products as Record<string, unknown>)) {
      if (!PRODUCT_RE.test(slug)) return NextResponse.json({ error: `Unknown product: ${slug}` }, { status: 400 });
      if (!isProductCadence(cadence)) return NextResponse.json({ error: `Bad cadence for ${slug}.` }, { status: 400 });
      rows.push({ product_slug: slug, cadence, updated_by: ADMIN_EMAIL, updated_at: now });
    }
  }

  if (rows.length === 0) return NextResponse.json({ error: "Nothing to save." }, { status: 400 });

  const db = qaDb();
  const { error } = await db.from("vw_qa_schedule").upsert(rows, { onConflict: "product_slug" });
  if (error) {
    console.error("[qa] schedule save failed:", error.code, error.message);
    return NextResponse.json({ error: "Couldn't save the schedule." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
