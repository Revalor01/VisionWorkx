import { NextRequest, NextResponse, after } from "next/server";
import { createServerClient, createServiceClient } from "@/lib/supabase";
import { isAdminOrEditor } from "@/lib/social/authGuard";
import { appendBrandOutro } from "@/lib/social/videoOutro";

export const runtime = "nodejs";
export const maxDuration = 300;

const BUCKET = "social-video-assets";

// Media Studio's "Import" flow, step 2 - called once the browser has
// finished uploading the raw file that studio-import/route.ts got a signed
// URL for. Downloads that raw footage back out of Storage, runs it through
// the same appendBrandOutro() used for AI-generated clips (now with the
// fade-in/fade-out outro), and re-uploads the branded result as final_path.
// Background-job shape matches studio-generate/route.ts: flip to
// "generating" and respond immediately, finish the ffmpeg work in after(),
// frontend polls GET /api/social/video-assets/[id] same as it already does.
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!(await isAdminOrEditor(user))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceClient();
  const { data: asset, error: fetchError } = await service
    .from("social_video_assets")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
  if (!asset) return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  if (asset.origin !== "studio") return NextResponse.json({ error: "Not a Media Studio asset" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const outroApp: string = body?.outroApp || asset.studio_outro_app || "none";

  const { error: updateError } = await service
    .from("social_video_assets")
    .update({ status: "generating", updated_at: new Date().toISOString() })
    .eq("id", params.id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  after(async () => {
    try {
      const { data: file, error: downloadError } = await service.storage.from(BUCKET).download(asset.raw_path);
      if (downloadError || !file) throw new Error(downloadError?.message || "Failed to download raw upload");
      const rawBytes = Buffer.from(await file.arrayBuffer());

      const bytes = outroApp === "none" ? rawBytes : await appendBrandOutro(rawBytes, outroApp);

      const finalPath = asset.raw_path.replace("/studio-import/", "/studio/");
      const { error: uploadError } = await service.storage
        .from(BUCKET)
        .upload(finalPath, bytes, { contentType: "video/mp4", upsert: true });
      if (uploadError) throw new Error(uploadError.message);

      await service
        .from("social_video_assets")
        .update({ status: "ready", final_path: finalPath, updated_at: new Date().toISOString() })
        .eq("id", params.id);
    } catch (err) {
      await service
        .from("social_video_assets")
        .update({
          status: "failed",
          notes: `Outro processing failed: ${(err as Error).message}`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", params.id);
    }
  });

  return NextResponse.json({ ok: true }, { status: 202 });
}
