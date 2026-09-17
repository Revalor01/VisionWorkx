import { NextRequest, NextResponse, after } from "next/server";
import { createServerClient, createServiceClient } from "@/lib/supabase";
import { isAdmin } from "@/lib/social/authGuard";
import { generateStudioVideo } from "@/lib/social/videoGenerator";
import { appendBrandOutro } from "@/lib/social/videoOutro";

export const runtime = "nodejs";
export const maxDuration = 300;

const BUCKET = "social-video-assets";
const OUTRO_APPS = ["VisionWorkx", "Revalor Kids", "Revalor Wellness", "Revalor LLC"];
const MIN_DURATION = 3;
const MAX_DURATION = 15;

// Media Studio's own generation route — mirrors
// app/api/social/content/[id]/generate-video/route.ts's background-job
// shape (create the row, respond immediately, finish in after()), but the
// prompt and length come directly from the admin instead of being derived
// from a post's caption, and the resulting row is tagged origin: "studio"
// so it's identifiable to any other social process (and still shows up in
// the same "Video asset" pickers on the Content/LinkedIn tabs, since it's
// the same table).
export async function POST(req: NextRequest) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!isAdmin(user)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const brandId: string | undefined = body?.brandId;
  const prompt: string | undefined = body?.prompt?.trim();
  const durationSeconds: number | undefined = body?.durationSeconds;
  const outroApp: string = body?.outroApp || "none";

  if (!brandId) return NextResponse.json({ error: "brandId is required" }, { status: 400 });
  if (!prompt) return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  if (
    typeof durationSeconds !== "number" ||
    !Number.isFinite(durationSeconds) ||
    durationSeconds < MIN_DURATION ||
    durationSeconds > MAX_DURATION
  ) {
    return NextResponse.json({ error: `durationSeconds must be between ${MIN_DURATION} and ${MAX_DURATION}` }, { status: 400 });
  }
  if (outroApp !== "none" && !OUTRO_APPS.includes(outroApp)) {
    return NextResponse.json({ error: `outroApp must be one of: none, ${OUTRO_APPS.join(", ")}` }, { status: 400 });
  }

  const service = createServiceClient();
  const { data: brand } = await service.from("social_brands").select("id").eq("id", brandId).maybeSingle();
  if (!brand) return NextResponse.json({ error: "Brand not found" }, { status: 404 });

  const assetId = crypto.randomUUID();
  const path = `${brandId}/studio/${assetId}.mp4`;

  const { data: asset, error: insertError } = await service
    .from("social_video_assets")
    .insert({
      id: assetId,
      brand_id: brandId,
      raw_path: path,
      status: "generating",
      notes: `Media Studio (Kling v3.0) — ${durationSeconds}s`,
      origin: "studio",
      studio_prompt: prompt,
      studio_duration_seconds: durationSeconds,
      studio_outro_app: outroApp,
    })
    .select("*")
    .single();
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  after(async () => {
    try {
      const video = await generateStudioVideo({ prompt, durationSeconds });

      const bytes =
        outroApp === "none" ? Buffer.from(video.bytes) : await appendBrandOutro(Buffer.from(video.bytes), outroApp);

      const { error: uploadError } = await service.storage
        .from(BUCKET)
        .upload(path, bytes, { contentType: video.mediaType || "video/mp4", upsert: true });
      if (uploadError) throw new Error(uploadError.message);

      await service
        .from("social_video_assets")
        .update({ status: "ready", final_path: path, updated_at: new Date().toISOString() })
        .eq("id", assetId);
    } catch (err) {
      await service
        .from("social_video_assets")
        .update({
          status: "failed",
          notes: `Generation failed: ${(err as Error).message}`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", assetId);
    }
  });

  return NextResponse.json({ ok: true, asset }, { status: 202 });
}
