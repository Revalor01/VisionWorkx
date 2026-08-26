import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createServiceClient } from "@/lib/supabase";
import { isAdminOrEditor } from "@/lib/social/authGuard";

const BUCKET = "social-video-assets";
const SIGNED_URL_TTL_SECONDS = 300;

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!(await isAdminOrEditor(user))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const which = req.nextUrl.searchParams.get("which") === "final" ? "final" : "raw";

  const service = createServiceClient();
  const { data: asset } = await service
    .from("social_video_assets")
    .select("raw_path, final_path")
    .eq("id", params.id)
    .maybeSingle();
  if (!asset) return NextResponse.json({ error: "Asset not found" }, { status: 404 });

  const path = which === "final" ? asset.final_path : asset.raw_path;
  if (!path) return NextResponse.json({ error: `No ${which} file for this asset` }, { status: 404 });

  const { data: signed, error } = await service.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ url: signed.signedUrl });
}
