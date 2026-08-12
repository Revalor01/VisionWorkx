import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/social/adminAuth";
import { getMediaGenerationSpend } from "@/lib/social/gatewaySpend";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const daysParam = Number(req.nextUrl.searchParams.get("days"));
  const days = Number.isFinite(daysParam) && daysParam > 0 ? daysParam : 30;

  try {
    const spend = await getMediaGenerationSpend(days);
    return NextResponse.json(spend);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
