import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { publishPost } from "@/lib/social/publishPost";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = createServiceClient();

  const { data: due } = await service
    .from("social_content")
    .select("*")
    .eq("status", "scheduled")
    .lte("scheduled_at", new Date().toISOString());

  const results: { id: string; ok: boolean; error?: string }[] = [];

  for (const post of due ?? []) {
    const result = await publishPost(service, post);
    results.push({ id: post.id, ...result });
  }

  return NextResponse.json({ processed: results.length, results });
}
