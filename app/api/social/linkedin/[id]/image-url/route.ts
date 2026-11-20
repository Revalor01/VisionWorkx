import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createServiceClient } from "@/lib/supabase";
import { isAdmin } from "@/lib/social/authGuard";
import { LINKEDIN_IMAGE_BUCKET } from "@/lib/social/linkedinImage";

const SIGNED_URL_TTL_SECONDS = 300;

// Admin-only: short-lived link to preview a LinkedIn post's image.
export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!isAdmin(user)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceClient();
  const { data: post } = await service.from("linkedin_posts").select("image_path").eq("id", params.id).maybeSingle();
  if (!post?.image_path) return NextResponse.json({ error: "No image for this post" }, { status: 404 });

  const { data: signed, error } = await service.storage.from(LINKEDIN_IMAGE_BUCKET).createSignedUrl(post.image_path, SIGNED_URL_TTL_SECONDS);
  if (error) {
    console.error("[social/linkedin/image] storage link failed:", params.id, error.message);
    return NextResponse.json({ error: "Couldn't create the image link. Try again." }, { status: 500 });
  }

  return NextResponse.json({ url: signed.signedUrl });
}
