import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createServiceClient } from "@/lib/supabase";
import { isAdminOrEditor } from "@/lib/social/authGuard";

const BUCKET = "social-video-assets";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!(await isAdminOrEditor(user))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { filename?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const service = createServiceClient();
  const { data: asset } = await service.from("social_video_assets").select("brand_id").eq("id", params.id).maybeSingle();
  if (!asset) return NextResponse.json({ error: "Asset not found" }, { status: 404 });

  const ext = body.filename?.split(".").pop() ?? "mp4";
  const path = `${asset.brand_id}/final/${params.id}.${ext}`;

  const { data: signed, error } = await service.storage.from(BUCKET).createSignedUploadUrl(path, { upsert: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ uploadUrl: signed.signedUrl, uploadToken: signed.token, path });
}
