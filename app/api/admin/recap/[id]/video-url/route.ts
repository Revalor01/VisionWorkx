import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/social/adminAuth";

const BUCKET = "weekly-recap-videos";
const SIGNED_URL_TTL_SECONDS = 600;

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceClient();
  const { data: recap } = await service
    .from("weekly_recaps")
    .select("video_path, week_start")
    .eq("id", params.id)
    .maybeSingle();
  if (!recap?.video_path) return NextResponse.json({ error: "No video for this recap" }, { status: 404 });

  const wantsDownload = req.nextUrl.searchParams.get("download") === "1";
  const { data: signed, error } = await service.storage
    .from(BUCKET)
    .createSignedUrl(
      recap.video_path,
      SIGNED_URL_TTL_SECONDS,
      wantsDownload ? { download: `revalor-weekly-recap-${recap.week_start}.mp4` } : undefined
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ url: signed.signedUrl });
}
