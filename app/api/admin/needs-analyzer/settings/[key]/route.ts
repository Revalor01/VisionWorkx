import { NextRequest, NextResponse } from "next/server";
import { isOperator } from "@/lib/modules/adminGuard";
import { naDb, saveSetting } from "@/lib/needsAnalyzer/db";
import { isCatalog, isEcosystem, readJson } from "@/lib/needsAnalyzer/validate";

// Operator-only: save the catalog (modules, prices, company info, logos) or the ecosystem.
export const runtime = "nodejs";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  if (!(await isOperator())) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const { key } = await params;
  if (key !== "catalog" && key !== "ecosystem") return NextResponse.json({ error: "Not found" }, { status: 404 });
  let value: unknown;
  try {
    value = await readJson(req);
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  if (key === "catalog" ? !isCatalog(value) : !isEcosystem(value)) return NextResponse.json({ error: "That doesn't look right" }, { status: 400 });
  const { error } = await saveSetting(naDb(), key, value);
  if (error) return NextResponse.json({ error: "Save failed" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
