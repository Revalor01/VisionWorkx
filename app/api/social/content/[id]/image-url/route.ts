import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createServiceClient } from "@/lib/supabase";
import { isAdmin } from "@/lib/social/authGuard";

const BUCKET = "social-content-images";
const SIGNED_URL_TTL_SECONDS = 300;

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!isAdmin(user)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceClient();
  const { data: post } = await service.from("social_content").select("image_path").eq("id", params.id).maybeSingle();
  if (!post?.image_path) return NextResponse.json({ error: "No image for this post" }, { status: 404 });

  const { data: signed, error } = await service.storage.from(BUCKET).createSignedUrl(post.image_path, SIGNED_URL_TTL_SECONDS);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ url: signed.signedUrl });
}
