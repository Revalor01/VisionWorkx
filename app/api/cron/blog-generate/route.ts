import { NextRequest, NextResponse } from "next/server";
import { runBlogGeneration } from "@/lib/blog/pipeline";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runBlogGeneration();
  return NextResponse.json(result);
}
