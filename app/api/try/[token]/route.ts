import { NextRequest, NextResponse } from "next/server";
import { getPreviewByToken } from "@/lib/apps/preview";

export const runtime = "nodejs";

// GET — poll a preview's status for the /try/[token] page.
export async function GET(
  _req: NextRequest,
  props: { params: Promise<{ token: string }> },
) {
  const { token } = await props.params;
  const preview = await getPreviewByToken(token);
  if (!preview) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({
    name: preview.name,
    status: preview.status,
    deployUrl: preview.deployUrl,
    expiresAt: preview.expiresAt,
    claimed: preview.claimed,
    email: preview.email,
  });
}
