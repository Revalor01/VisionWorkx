import { NextRequest, NextResponse } from "next/server";
import { isOperator } from "@/lib/modules/adminGuard";
import { naDb, newShareToken, UUID_RE } from "@/lib/needsAnalyzer/db";

// Operator-only: the client proposal link (/proposal/<token>).
//   enable      turn the link on (reuses the existing token, or makes one)
//   disable     turn it off -- the link stops working immediately
//   regenerate  new token, link on -- the old link stops working
export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isOperator())) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { action } = (await req.json().catch(() => ({}))) as { action?: string };
  if (!["enable", "disable", "regenerate"].includes(action ?? "")) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  const db = naDb();
  const { data: row } = await db.from("vw_na_assessments").select("share_token").eq("id", id).is("deleted_at", null).maybeSingle();
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const patch =
    action === "disable"
      ? { share_enabled: false }
      : { share_enabled: true, share_token: action === "regenerate" || !row.share_token ? newShareToken() : row.share_token };
  const { data, error } = await db.from("vw_na_assessments").update(patch).eq("id", id).select("share_token, share_enabled").single();
  if (error || !data) return NextResponse.json({ error: "Couldn't update the link" }, { status: 500 });
  return NextResponse.json({ shareToken: data.share_token, shareEnabled: data.share_enabled });
}
