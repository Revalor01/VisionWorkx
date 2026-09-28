import { NextRequest, NextResponse } from "next/server";
import { isOperator } from "@/lib/modules/adminGuard";
import { QA_BUCKET, qaDb } from "@/lib/qa/db";

// Operator-only: a short-lived link to one screenshot, trace or video.
export const runtime = "nodejs";

const PATH_RE = /^[0-9a-f-]{36}\/[a-z0-9_-]+\/attempt-\d+-(screenshot\.png|trace\.zip|video\.webm)$/;

export async function GET(req: NextRequest) {
  if (!(await isOperator())) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const path = req.nextUrl.searchParams.get("path") ?? "";
  if (!PATH_RE.test(path)) return NextResponse.json({ error: "Bad path" }, { status: 400 });
  const { data } = await qaDb()
    .storage.from(QA_BUCKET)
    .createSignedUrl(path, 300, path.endsWith(".zip") ? { download: true } : undefined);
  if (!data?.signedUrl) return NextResponse.json({ error: "Not uploaded (the runner may have failed to send it)." }, { status: 404 });
  return NextResponse.redirect(data.signedUrl);
}
