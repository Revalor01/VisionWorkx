import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/social/adminAuth";
import { generateRecapVideo } from "@/lib/social/recapVideoGenerator";

export const runtime = "nodejs";
export const maxDuration = 300;

const BUCKET = "weekly-recap-videos";

export async function POST(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!(await isAdminRequest())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceClient();
  const { data: recap } = await service.from("weekly_recaps").select("*").eq("id", params.id).maybeSingle();
  if (!recap) return NextResponse.json({ error: "Recap not found" }, { status: 404 });
  if (!recap.video_prompt) return NextResponse.json({ error: "No video prompt to generate from" }, { status: 400 });

  try {
    const video = await generateRecapVideo(recap.video_prompt);
    const path = `${recap.id}.mp4`;

    const { error: uploadError } = await service.storage
      .from(BUCKET)
      .upload(path, video.bytes, { contentType: video.mediaType || "video/mp4", upsert: true });
    if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

    const { error: updateError } = await service
      .from("weekly_recaps")
      .update({ video_path: path, status: "video_ready", updated_at: new Date().toISOString() })
      .eq("id", recap.id);
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

    return NextResponse.json({ ok: true, videoPath: path });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
