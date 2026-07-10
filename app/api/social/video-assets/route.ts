import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createServiceClient } from "@/lib/supabase";
import { isAdminOrEditor } from "@/lib/social/authGuard";

const BUCKET = "social-video-assets";

export async function GET() {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!(await isAdminOrEditor(user))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceClient();
  const { data: assets, error } = await service
    .from("social_video_assets")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ assets: assets ?? [] });
}

// Creates the tracking row and returns a short-lived signed upload URL —
// raw footage can run up to 500MB, far past what a Vercel function body
// can proxy, so the browser uploads directly to Supabase Storage.
export async function POST(req: NextRequest) {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!(await isAdminOrEditor(user))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { brandId?: string; filename?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.brandId || !body.filename) {
    return NextResponse.json({ error: "Missing brandId or filename" }, { status: 400 });
  }

  const ext = body.filename.split(".").pop() ?? "mp4";
  const path = `${body.brandId}/raw/${crypto.randomUUID()}.${ext}`;

  const service = createServiceClient();

  const { data: signed, error: signError } = await service.storage
    .from(BUCKET)
    .createSignedUploadUrl(path);
  if (signError) return NextResponse.json({ error: signError.message }, { status: 500 });

  const { data: asset, error: insertError } = await service
    .from("social_video_assets")
    .insert({ brand_id: body.brandId, raw_path: path, status: "raw" })
    .select("*")
    .single();
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  return NextResponse.json(
    { asset, uploadUrl: signed.signedUrl, uploadToken: signed.token, path },
    { status: 201 }
  );
}
