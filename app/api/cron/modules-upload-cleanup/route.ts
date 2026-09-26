import { NextRequest, NextResponse } from "next/server";
import { modulesConfigured, modulesServiceClient } from "@/lib/modules/supabase";
import { UPLOAD_BUCKET } from "@/lib/modules/constants";

// Daily: delete files visitors uploaded to a module form but never submitted
// (older than 24h and not referenced by any submission). Files attached to a
// submission are never touched. Deletes through the storage API so the stored
// objects are actually removed, not just their rows.
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || (req.headers.get("authorization") ?? "") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!modulesConfigured()) return NextResponse.json({ skipped: "modules DB not configured" });

  const db = modulesServiceClient();
  const { data, error } = await db.rpc("vw_orphan_uploads", { p_older_hours: 24, p_limit: 500 });
  if (error) {
    console.error("[modules-upload-cleanup] lookup failed:", error.message);
    return NextResponse.json({ error: "lookup failed" }, { status: 500 });
  }
  const paths = ((data ?? []) as unknown[]).filter((p): p is string => typeof p === "string");
  if (paths.length === 0) return NextResponse.json({ removed: 0 });

  let removed = 0;
  for (let i = 0; i < paths.length; i += 100) {
    const { data: gone, error: rmErr } = await db.storage.from(UPLOAD_BUCKET).remove(paths.slice(i, i + 100));
    if (rmErr) console.error("[modules-upload-cleanup] remove failed:", rmErr.message);
    removed += gone?.length ?? 0;
  }
  return NextResponse.json({ found: paths.length, removed });
}
