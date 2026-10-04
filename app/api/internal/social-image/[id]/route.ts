import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { runAutoImage } from "@/lib/social/postImage";

export const runtime = "nodejs";
export const maxDuration = 120;

// Makes one post's automatic image. Called only by /api/cron/social-images,
// as its own request so it runs like the dashboard's Generate image (Vercel
// adds the AI Gateway sign-in token to incoming requests; a cron run may not
// carry it). Same CRON_SECRET; refuses if the secret is unset.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const secret = process.env.CRON_SECRET;
  if (!secret || (req.headers.get("authorization") ?? "") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await props.params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const result = await runAutoImage(createServiceClient(), id);
  return NextResponse.json(result, { status: result.ok || result.skipped ? 200 : 500 });
}
